package com.vshpynta.expenses.api.sync.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.sync.model.ExpensePayload
import com.vshpynta.expenses.api.sync.model.OpEntry
import com.vshpynta.expenses.api.sync.model.Operation
import com.vshpynta.expenses.api.sync.model.OperationType
import com.vshpynta.expenses.api.sync.model.SyncFile
import com.vshpynta.expenses.api.sync.repository.ExpenseUpsertRepository
import com.vshpynta.expenses.api.sync.repository.OperationRepository
import kotlinx.coroutines.flow.toList
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.io.File
import java.util.UUID

/**
 * Event-based synchronization service
 * Implements conflict-free, idempotent sync using event sourcing
 */
@Service
class SyncService(
    private val operationRepository: OperationRepository,
    private val upsertRepository: ExpenseUpsertRepository,
    private val objectMapper: ObjectMapper,
    @Value("\${sync.file.path:./sync-data/sync.json}") private val syncFilePath: String,
    @Value("\${sync.device.id:device-default}") private val deviceId: String
) {
    private val logger = LoggerFactory.getLogger(SyncService::class.java)

    /**
     * Collect all uncommitted local operations
     */
    suspend fun collectLocalOperations(): List<Operation> {
        return operationRepository.findUncommittedOperations().toList()
    }

    /**
     * Append operations to the shared sync file
     */
    suspend fun appendOperationsToFile(operations: List<Operation>) {
        if (operations.isEmpty()) {
            logger.debug("No operations to append")
            return
        }

        val file = File(syncFilePath)
        file.parentFile?.mkdirs()

        // Read existing file or create new
        val syncFile = if (file.exists()) {
            try {
                objectMapper.readValue(file, SyncFile::class.java)
            } catch (e: Exception) {
                logger.warn("Failed to read sync file, creating new: ${e.message}")
                SyncFile()
            }
        } else {
            SyncFile()
        }

        // Convert operations to OpEntry
        val newOpEntries = operations.map { operation ->
            val payload = objectMapper.readValue(operation.payload, ExpensePayload::class.java)
            OpEntry(
                opId = operation.opId.toString(),
                ts = operation.ts,
                deviceId = operation.deviceId,
                opType = operation.operationType.name,
                entityId = operation.entityId.toString(),
                payload = payload
            )
        }

        // Append new operations to existing ones
        val updatedOps = syncFile.ops + newOpEntries
        val updatedSyncFile = syncFile.copy(ops = updatedOps)

        // Write back to file
        objectMapper.writerWithDefaultPrettyPrinter()
            .writeValue(file, updatedSyncFile)

        logger.info("Appended ${operations.size} operations to sync file")
    }

    /**
     * Read remote operations from sync file
     */
    suspend fun readRemoteOps(): List<OpEntry> {
        val file = File(syncFilePath)

        if (!file.exists()) {
            logger.debug("Sync file does not exist yet")
            return emptyList()
        }

        return try {
            val syncFile = objectMapper.readValue(file, SyncFile::class.java)
            // Sort by (ts, deviceId, opId) for deterministic order
            syncFile.ops.sortedWith(
                compareBy<OpEntry> { it.ts }
                    .thenBy { it.deviceId }
                    .thenBy { it.opId }
            )
        } catch (e: Exception) {
            logger.error("Failed to read remote ops from sync file", e)
            emptyList()
        }
    }

    /**
     * Apply remote operations transactionally with idempotency
     * This is the core sync logic
     * Note: Each database operation is atomic. We process ops sequentially for consistency.
     */
    suspend fun applyRemoteOpsTransactionally(remoteOps: List<OpEntry>): Int {
        var appliedCount = 0

        for (opEntry in remoteOps) {
            try {
                val opId = UUID.fromString(opEntry.opId)

                // Skip if already applied (idempotency)
                if (upsertRepository.isOperationApplied(opId)) {
                    logger.debug("Skipping already applied operation: $opId")
                    continue
                }

                // Apply operation based on type
                when (OperationType.valueOf(opEntry.opType)) {
                    OperationType.CREATE, OperationType.UPDATE -> {
                        upsertRepository.upsertExpense(opEntry.payload)
                    }

                    OperationType.DELETE -> {
                        upsertRepository.softDeleteExpense(
                            id = UUID.fromString(opEntry.entityId),
                            updatedAt = opEntry.payload.updatedAt
                        )
                    }
                }

                // Mark as applied
                upsertRepository.markOperationAsApplied(opId)

                // If this operation came from our device, mark it as committed
                if (opEntry.deviceId == deviceId) {
                    upsertRepository.markOperationsAsCommitted(deviceId, listOf(opId))
                }

                appliedCount++
                logger.debug("Applied operation: $opId (type=${opEntry.opType}, entity=${opEntry.entityId})")

            } catch (e: Exception) {
                logger.error("Failed to apply op: ${opEntry.opId}", e)
                // Continue with next operation (resilient to individual failures)
            }
        }

        logger.info("Applied $appliedCount out of ${remoteOps.size} remote operations")
        return appliedCount
    }

    /**
     * Full sync cycle: upload local ops, then download and apply remote ops
     */
    suspend fun performFullSync() {
        logger.info("Starting full sync cycle")

        try {
            // 1. Upload: Collect local uncommitted operations
            val localOperations = collectLocalOperations()
            logger.info("Collected ${localOperations.size} local uncommitted operations")

            // 2. Upload: Append to sync file
            if (localOperations.isNotEmpty()) {
                appendOperationsToFile(localOperations)
            }

            // 3. Download: Read all remote operations
            val remoteOps = readRemoteOps()
            logger.info("Read ${remoteOps.size} remote operations")

            // 4. Download: Apply remote ops with idempotency
            val appliedCount = applyRemoteOpsTransactionally(remoteOps)

            logger.info("Sync completed: applied $appliedCount operations")

        } catch (e: Exception) {
            logger.error("Sync failed", e)
            throw e
        }
    }

    fun getDeviceId(): String = deviceId
}
