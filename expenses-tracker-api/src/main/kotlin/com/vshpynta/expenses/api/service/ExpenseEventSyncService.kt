package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.EventSyncFile
import com.vshpynta.expenses.api.model.ExpenseEvent
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.io.File

/**
 * Expense event synchronization service
 * Implements conflict-free, idempotent sync using event sourcing
 * Synchronizes expense events between devices via shared file
 */
@Service
class ExpenseEventSyncService(
    private val eventRepository: ExpenseEventRepository,
    private val eventProjector: ExpenseEventProjector,
    private val objectMapper: ObjectMapper,
    @Value("\${sync.file.path:./sync-data/sync.json}") private val syncFilePath: String,
    @Value("\${sync.device.id:device-default}") private val deviceId: String
) {
    private val logger = LoggerFactory.getLogger(ExpenseEventSyncService::class.java)

    /**
     * Collect all uncommitted local events
     */
    suspend fun collectLocalEvents(): List<ExpenseEvent> = withContext(Dispatchers.IO) {
        eventRepository.findUncommittedEvents(deviceId).toList()
    }

    /**
     * Append events to the shared sync file
     */
    suspend fun appendEventsToFile(events: List<ExpenseEvent>) = withContext(Dispatchers.IO) {
        if (events.isEmpty()) {
            logger.debug("No events to append")
            return@withContext
        }

        val file = File(syncFilePath).apply {
            parentFile?.mkdirs()
        }

        // Read existing file or create new
        val syncFile = runCatching {
            file.takeIf { it.exists() }?.let {
                objectMapper.readValue(it, EventSyncFile::class.java)
            }
        }.getOrElse { e ->
            logger.warn("Failed to read sync file, creating new: ${e.message}")
            null
        } ?: EventSyncFile()

        // Convert events to EventEntry
        val newEventEntries = events.map { it.toEventEntry() }

        // Append new events and write back
        val updatedSyncFile = syncFile.copy(events = syncFile.events + newEventEntries)
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, updatedSyncFile)

        logger.info("Appended ${events.size} events to sync file")
    }

    /**
     * Read remote events from sync file
     */
    suspend fun readRemoteOps(): List<EventEntry> = withContext(Dispatchers.IO) {
        val file = File(syncFilePath)

        file.takeIf { it.exists() }
            ?.let {
                runCatching {
                    objectMapper.readValue(it, EventSyncFile::class.java).events.sortedWith(
                        compareBy<EventEntry> { entry -> entry.timestamp }
                            .thenBy { entry -> entry.deviceId }
                            .thenBy { entry -> entry.eventId }
                    )
                }.getOrElse { e ->
                    logger.error("Failed to read remote events from sync file", e)
                    emptyList()
                }
            }
            ?: run {
                logger.debug("Sync file does not exist yet")
                emptyList()
            }
    }

    /**
     * Apply remote events with idempotency
     * This is the core sync logic
     * Note: Each event is projected transactionally via eventProjector.
     * Events are processed sequentially for consistency.
     * Individual event failures don't stop the entire process.
     */
    suspend fun applyRemoteOperations(remoteOps: List<EventEntry>): Int = withContext(Dispatchers.IO) {
        remoteOps.count { eventEntry ->
            runCatching<Boolean> {
                eventProjector.projectIfNotProcessed(eventEntry, deviceId)
            }.onFailure { e ->
                logger.error("Failed to project event: ${eventEntry.eventId}", e)
            }.getOrDefault(false)  // Return false if event failed or was already processed
        }.also { projectedCount ->
            logger.info("Projected $projectedCount out of ${remoteOps.size} remote events")
        }
    }

    /**
     * Full sync cycle with efficient network usage:
     * 1. Download sync file ONCE
     * 2. Process remote events (from other devices and previous syncs)
     * 3. Append local uncommitted events to the file
     * 4. Upload updated file
     *
     * Note: Local events are marked as committed during the NEXT sync cycle
     * when this device reads them back from the file. This is correct and
     * reduces network traffic by 50% (only 1 download instead of 2).
     */
    suspend fun performFullSync() {
        logger.info("Starting full sync cycle")

        runCatching {
            // 1. Download: Read remote events from sync file (ONCE!)
            val remoteEvents = readRemoteOps()
                .also { logger.info("Downloaded ${it.size} remote events") }

            // 2. Process: Apply remote events (includes our events from previous syncs)
            applyRemoteOperations(remoteEvents)
                .also { logger.info("Processed $it remote events") }

            // 3. Collect: Get local uncommitted events
            val localEvents = collectLocalEvents()
                .also { logger.info("Collected ${it.size} local uncommitted events") }

            // 4. Upload: Append local events to file and upload
            if (localEvents.isNotEmpty()) {
                appendEventsToFile(localEvents)
                logger.info("Uploaded ${localEvents.size} local events to sync file")
            }

            logger.info("Sync completed successfully")
        }.onFailure { e ->
            logger.error("Sync failed", e)
            throw e
        }
    }

    fun getDeviceId(): String = deviceId

    /**
     * Convert ExpenseEvent to EventEntry
     */
    private fun ExpenseEvent.toEventEntry(): EventEntry {
        val payload = objectMapper.readValue(this.payload, ExpensePayload::class.java)
        return EventEntry(
            eventId = eventId.toString(),
            timestamp = timestamp,
            deviceId = deviceId,
            eventType = eventType.name,
            expenseId = expenseId.toString(),
            payload = payload
        )
    }
}
