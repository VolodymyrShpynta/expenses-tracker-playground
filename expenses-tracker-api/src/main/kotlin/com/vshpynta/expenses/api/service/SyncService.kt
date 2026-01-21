package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.OpEntry
import com.vshpynta.expenses.api.model.Operation
import com.vshpynta.expenses.api.model.OperationType
import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.model.SyncFile
import com.vshpynta.expenses.api.repository.AppliedOperationRepository
import com.vshpynta.expenses.api.repository.ExpenseRepository
import com.vshpynta.expenses.api.repository.OperationRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.withContext
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
    private val expenseRepository: ExpenseRepository,
    private val appliedOperationRepository: AppliedOperationRepository,
    private val objectMapper: ObjectMapper,
    @Value("\${sync.file.path:./sync-data/sync.json}") private val syncFilePath: String,
    @Value("\${sync.device.id:device-default}") private val deviceId: String
) {
    private val logger = LoggerFactory.getLogger(SyncService::class.java)

    /**
     * Collect all uncommitted local operations
     */
    suspend fun collectLocalOperations(): List<Operation> = withContext(Dispatchers.IO) {
        operationRepository.findUncommittedOperations(deviceId).toList()
    }

    /**
     * Append operations to the shared sync file
     */
    suspend fun appendOperationsToFile(operations: List<Operation>) = withContext(Dispatchers.IO) {
        if (operations.isEmpty()) {
            logger.debug("No operations to append")
            return@withContext
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
    suspend fun readRemoteOps(): List<OpEntry> = withContext(Dispatchers.IO) {
        val file = File(syncFilePath)

        if (!file.exists()) {
            logger.debug("Sync file does not exist yet")
            return@withContext emptyList()
        }

        try {
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
    suspend fun applyRemoteOpsTransactionally(remoteOps: List<OpEntry>): Int = withContext(Dispatchers.IO) {
        var appliedCount = 0

        for (opEntry in remoteOps) {
            try {
                val opId = UUID.fromString(opEntry.opId)

                // Skip if already applied (idempotency)
                if (appliedOperationRepository.hasBeenApplied(opId)) {
                    logger.debug("Skipping already applied operation: {}", opId)
                    continue
                }

                // Apply operation based on type
                when (OperationType.valueOf(opEntry.opType)) {
                    OperationType.CREATE, OperationType.UPDATE -> {
                        expenseRepository.upsertExpense(
                            SyncExpense(
                                id = opEntry.payload.id,
                                description = opEntry.payload.description,
                                amount = opEntry.payload.amount ?: 0L,
                                category = opEntry.payload.category,
                                date = opEntry.payload.date,
                                updatedAt = opEntry.payload.updatedAt,
                                deleted = opEntry.payload.deleted ?: false
                            )
                        )
                    }

                    OperationType.DELETE -> {
                        expenseRepository.softDeleteExpense(
                            id = UUID.fromString(opEntry.entityId),
                            updatedAt = opEntry.payload.updatedAt
                        )
                    }
                }

                // Mark as applied
                appliedOperationRepository.markAsApplied(opId)

                // If this operation came from our device, mark it as committed
                if (opEntry.deviceId == deviceId) {
                    operationRepository.markOperationsAsCommitted(deviceId, listOf(opId))
                }

                appliedCount++
                logger.debug("Applied operation: {} (type={}, entity={})", opId, opEntry.opType, opEntry.entityId)

            } catch (e: Exception) {
                logger.error("Failed to apply op: ${opEntry.opId}", e)
                // Continue with next operation (resilient to individual failures)
            }
        }

        logger.info("Applied $appliedCount out of ${remoteOps.size} remote operations")
        appliedCount
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
