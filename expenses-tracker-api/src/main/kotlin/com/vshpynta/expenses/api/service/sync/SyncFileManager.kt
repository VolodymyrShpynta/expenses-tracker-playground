package com.vshpynta.expenses.api.service.sync

import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.EventSyncFile
import com.vshpynta.expenses.api.model.ExpenseEvent
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.util.JsonOperations
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.io.File
import java.util.concurrent.atomic.AtomicReference

/**
 * Manages sync-specific file operations
 *
 * Responsibilities:
 * - Sync file path resolution with compression
 * - Checksum caching for change detection
 * - Sync-specific event processing (sorting, filtering)
 * - Orchestrating general file operations for sync use case
 */
@Component
class SyncFileManager(
    private val fileOperations: FileOperations,
    private val jsonOperations: JsonOperations,
    @Value($$"${sync.file.path:./sync-data/sync.json}") private val syncFilePath: String,
    @Value($$"${sync.file.compression.enabled:true}") private val compressionEnabled: Boolean
) {
    private val cachedChecksum = AtomicReference<String?>(null)

    companion object {
        private val logger = LoggerFactory.getLogger(SyncFileManager::class.java)
        private const val GZIP_EXTENSION = ".gz"
    }

    suspend fun getSyncFile(): File {
        val file = File(getActualFilePath())
        fileOperations.ensureParentDirectories(file)
        return file
    }

    /**
     * Checks if the sync file has changed since last sync
     */
    suspend fun hasFileChanged(file: File): Boolean {
        val previousChecksum = cachedChecksum.get() ?: return true
        return !fileOperations.matchesChecksum(file, previousChecksum)
    }

    suspend fun cacheFileChecksum(file: File) {
        val checksum = fileOperations.calculateChecksum(file)
        cachedChecksum.set(checksum)
    }

    /**
     * Reads events from sync file
     * Sync-specific: sorts events deterministically
     */
    suspend fun readEvents(file: File): List<EventEntry> {
        val syncFile = fileOperations.readJson(file, EventSyncFile::class.java, compressionEnabled)
            ?: run {
                logger.debug("Sync file does not exist yet")
                return emptyList()
            }

        return sortEventsIfNotEmpty(syncFile.events)
    }

    /**
     * Appends events to sync file
     * Sync-specific: merges with existing events, converts ExpenseEvent to EventEntry
     */
    suspend fun appendEvents(file: File, events: List<ExpenseEvent>) {
        val existingSyncFile = fileOperations.readJson(file, EventSyncFile::class.java, compressionEnabled)
            ?: EventSyncFile()

        val newEventEntries = events.map { it.toEventEntry() }
        val updatedSyncFile = existingSyncFile.copy(
            events = existingSyncFile.events + newEventEntries
        )

        fileOperations.writeJson(file, updatedSyncFile, compressionEnabled)
    }

    private fun getActualFilePath(): String =
        if (compressionEnabled) "$syncFilePath$GZIP_EXTENSION" else syncFilePath

    private fun sortEventsIfNotEmpty(events: List<EventEntry>): List<EventEntry> =
        events
            .takeIf { it.isNotEmpty() }
            ?.also { logger.debug("Read ${it.size} events from sync file") }
            ?.let { sortEventsDeterministically(it) }
            ?: run {
                logger.debug("No events in sync file")
                emptyList()
            }

    /**
     * Sorts events deterministically for consistent processing across all devices
     *
     * Primary: timestamp (chronological order)
     * Secondary: eventId (breaks ties when timestamps are equal)
     */
    private fun sortEventsDeterministically(events: List<EventEntry>): List<EventEntry> =
        events.sortedWith(
            compareBy<EventEntry> { it.timestamp }
                .thenBy { it.eventId }  // UUID is comparable and unique
        )

    /**
     * Converts ExpenseEvent to EventEntry
     * Sync-specific data transformation
     */
    private fun ExpenseEvent.toEventEntry(): EventEntry =
        EventEntry(
            eventId = eventId.toString(),
            timestamp = timestamp,
            eventType = eventType.name,
            expenseId = expenseId.toString(),
            payload = jsonOperations.fromJson(payload, ExpensePayload::class.java)
        )
}
