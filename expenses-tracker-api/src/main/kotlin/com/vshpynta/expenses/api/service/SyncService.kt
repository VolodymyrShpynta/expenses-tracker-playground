package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.OpEntry
import com.vshpynta.expenses.api.model.Operation
import com.vshpynta.expenses.api.model.SyncFile
import com.vshpynta.expenses.api.repository.OperationRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.io.File

/**
 * Event-based synchronization service
 * Implements conflict-free, idempotent sync using event sourcing
 */
@Service
class SyncService(
    private val operationRepository: OperationRepository,
    private val syncOperationExecutor: SyncOperationExecutor,
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

        val file = File(syncFilePath).apply {
            parentFile?.mkdirs()
        }

        // Read existing file or create new
        val syncFile = runCatching {
            file.takeIf { it.exists() }?.let {
                objectMapper.readValue(it, SyncFile::class.java)
            }
        }.getOrElse { e ->
            logger.warn("Failed to read sync file, creating new: ${e.message}")
            null
        } ?: SyncFile()

        // Convert operations to OpEntry
        val newOpEntries = operations.map { it.toOpEntry() }

        // Append new operations and write back
        val updatedSyncFile = syncFile.copy(ops = syncFile.ops + newOpEntries)
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, updatedSyncFile)

        logger.info("Appended ${operations.size} operations to sync file")
    }

    /**
     * Read remote operations from sync file
     */
    suspend fun readRemoteOps(): List<OpEntry> = withContext(Dispatchers.IO) {
        val file = File(syncFilePath)

        file.takeIf { it.exists() }
            ?.let {
                runCatching {
                    objectMapper.readValue(it, SyncFile::class.java).ops.sortedWith(
                        compareBy<OpEntry> { opEntry -> opEntry.ts }
                            .thenBy { opEntry -> opEntry.deviceId }
                            .thenBy { opEntry -> opEntry.opId }
                    )
                }.getOrElse { e ->
                    logger.error("Failed to read remote ops from sync file", e)
                    emptyList()
                }
            }
            ?: run {
                logger.debug("Sync file does not exist yet")
                emptyList()
            }
    }

    /**
     * Apply remote operations with idempotency
     * This is the core sync logic
     * Note: Each operation is applied transactionally via SyncOperationExecutor.
     * Operations are processed sequentially for consistency.
     * Individual operation failures don't stop the entire process.
     */
    suspend fun applyRemoteOperations(remoteOps: List<OpEntry>): Int = withContext(Dispatchers.IO) {
        remoteOps.count { opEntry ->
            runCatching<Boolean> {
                syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)
            }.onFailure { e ->
                logger.error("Failed to apply op: ${opEntry.opId}", e)
            }.getOrDefault(false)  // Return false if operation failed or was already applied
        }.also { appliedCount ->
            logger.info("Applied $appliedCount out of ${remoteOps.size} remote operations")
        }
    }

    /**
     * Full sync cycle: upload local ops, then download and apply remote ops
     */
    suspend fun performFullSync() {
        logger.info("Starting full sync cycle")

        runCatching {
            // 1. Upload: Collect and append local uncommitted operations
            collectLocalOperations()
                .also { logger.info("Collected ${it.size} local uncommitted operations") }
                .takeIf { it.isNotEmpty() }
                ?.let { appendOperationsToFile(it) }

            // 2. Download: Read and apply remote operations
            readRemoteOps()
                .also { logger.info("Read ${it.size} remote operations") }
                .let { applyRemoteOperations(it) }
                .also { logger.info("Sync completed: applied $it operations") }
        }.onFailure { e ->
            logger.error("Sync failed", e)
            throw e
        }
    }

    fun getDeviceId(): String = deviceId

    /**
     * Convert Operation to OpEntry
     */
    private fun Operation.toOpEntry(): OpEntry {
        val payload = objectMapper.readValue(this.payload, ExpensePayload::class.java)
        return OpEntry(
            opId = opId.toString(),
            ts = ts,
            deviceId = deviceId,
            opType = operationType.name,
            entityId = entityId.toString(),
            payload = payload
        )
    }
}
