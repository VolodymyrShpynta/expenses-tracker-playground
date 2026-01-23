package com.vshpynta.expenses.api.service.sync

import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.service.ExpenseSyncProjector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/**
 * Processes remote expense events
 *
 * Responsibilities:
 * - Coordinating projection of remote events
 * - Error handling for individual event failures
 * - Logging processing progress
 */
@Component
class RemoteEventProcessor(
    private val eventSyncProjector: ExpenseSyncProjector
) {

    companion object {
        private val logger = LoggerFactory.getLogger(RemoteEventProcessor::class.java)
    }

    /**
     * Processes remote events by projecting them to the materialized view
     *
     * @param remoteEvents List of events to process
     * @return Number of successfully processed events
     */
    suspend fun processRemoteEvents(remoteEvents: List<EventEntry>): Int {
        remoteEvents
            .also { logger.info("Processing ${it.size} remote events") }
            .takeIf { it.isNotEmpty() }
            ?.let { projectRemoteEvents(it) }
            ?.also { processed ->
                logger.info("Processed $processed out of ${remoteEvents.size} remote events")
            }
            ?: return 0

        return remoteEvents.size
    }

    private suspend fun projectRemoteEvents(remoteEvents: List<EventEntry>): Int = withContext(Dispatchers.IO) {
        remoteEvents.count {
            runCatching {
                eventSyncProjector.projectEvent(it)
            }.onFailure { e ->
                logger.error("Failed to project event: ${it.eventId}", e)
            }.getOrDefault(false)
        }
    }
}
