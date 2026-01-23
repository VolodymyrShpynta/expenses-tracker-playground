package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.service.sync.RemoteEventProcessor
import com.vshpynta.expenses.api.service.sync.SyncFileManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Orchestrates expense event synchronization between devices
 *
 * Coordinates sync operations by delegating to specialized components:
 * - SyncFileManager: File I/O operations
 * - RemoteEventProcessor: Processing remote events
 * - ExpenseEventRepository: Direct access to local events
 *
 * Optimizations:
 * - File change detection: Skips sync if file unchanged (hash-based)
 * - In-memory cache: Fast lookup of processed events
 * - Gzip compression: 70% smaller sync files
 */
@Service
class ExpenseEventSyncService(
    private val syncFileManager: SyncFileManager,
    private val remoteEventProcessor: RemoteEventProcessor,
    private val eventRepository: ExpenseEventRepository
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ExpenseEventSyncService::class.java)
    }

    /**
     * Performs full synchronization cycle between local and remote events
     *
     * Flow:
     * 1. Check if sync file changed (skip processing if unchanged)
     * 2. Process remote events if file changed
     * 3. Upload local uncommitted events (always, even if file unchanged)
     * 4. Update file hash for next sync optimization
     */
    suspend fun performFullSync() {
        logger.info("Starting sync cycle")

        runCatching {
            syncFileManager.getSyncFile().let { file ->
                // Process remote events if file changed
                file.takeIf { syncFileManager.hasFileChanged(it) }
                    ?.let { syncFileManager.readEvents(it) }
                    ?.also { remoteEventProcessor.processRemoteEvents(it) }
                    ?: logger.info("Sync file unchanged, skipping remote processing")

                // Upload local events if any
                collectLocalEvents()
                    .takeIf { it.isNotEmpty() }
                    ?.also { events ->
                        logger.info("Uploading ${events.size} local uncommitted events")
                        syncFileManager.appendEvents(file, events)
                        logger.info("Successfully uploaded ${events.size} local events")
                    }

                // Cache checksum for next sync
                syncFileManager.cacheFileChecksum(file)
            }

            logger.info("Sync completed successfully")
        }.onFailure { e ->
            logger.error("Sync failed", e)
            throw e
        }
    }

    private suspend fun collectLocalEvents() = withContext(Dispatchers.IO) {
        eventRepository.findUncommittedEvents().toList()
    }
}
