package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.repository.ProcessedEventRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Projects synchronized expense events to the materialized view
 *
 * Part of the sync subsystem - processes expense events received from the sync file
 * and projects them into the read-optimized view (expense projections).
 *
 * Note: Local expense operations (create/update/delete via ExpenseCommandService)
 * project events directly without using this component.
 *
 * Responsibilities:
 * - Check if event was already projected (avoids duplicate processing)
 * - Delegate to ExpenseSyncRecorder for database persistence
 * - Maintain cache consistency (update cache only after successful commit)
 */
@Component
class ExpenseSyncProjector(
    private val expenseSyncRecorder: ExpenseSyncRecorder,
    private val processedEventRepository: ProcessedEventRepository,
    private val processedEventsCache: ProcessedEventsCache
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ExpenseSyncProjector::class.java)
    }

    /**
     * Projects an expense event to the materialized view (idempotent)
     *
     * Performance optimization: Checks cache first (20ns), then DB (500μs) before
     * delegating to ExpenseSyncRecorder. Avoids unnecessary database operations for
     * already-processed events.
     *
     * Cache is updated AFTER successful transaction commit to prevent corruption
     * if transaction rolls back.
     *
     * @param eventEntry The expense event to project
     * @return true if event was projected, false if already processed
     */
    suspend fun projectEvent(eventEntry: EventEntry): Boolean = withContext(Dispatchers.IO) {
        val eventId = UUID.fromString(eventEntry.eventId)

        // Fast in-memory cache check (100% accurate)
        if (processedEventsCache.contains(eventId)) {
            logger.debug("Event already projected (cache hit): ${eventEntry.eventId}")
            return@withContext false
        }

        // Not in cache - double-check DB (safety net for cache misses)
        if (processedEventRepository.hasBeenProcessed(eventId)) {
            // Event was processed but not in cache (shouldn't happen, but defensive)
            logger.warn("Event processed in DB but not in cache: ${eventEntry.eventId}")
            processedEventsCache.add(eventId)  // Safe to add - it's in DB
            return@withContext false
        }

        // Event definitely not processed - project and commit in transaction
        // IMPORTANT: Delegate to separate component so @Transactional proxy works!
        val success = expenseSyncRecorder.projectAndCommitEvent(eventEntry, eventId)

        // IMPORTANT: Only update cache AFTER successful transaction commit!
        if (success) {
            processedEventsCache.add(eventId)
            logger.debug("Projected event: {} (type={}, expense={})", eventId, eventEntry.eventType, eventEntry.expenseId)
        }

        success
    }
}
