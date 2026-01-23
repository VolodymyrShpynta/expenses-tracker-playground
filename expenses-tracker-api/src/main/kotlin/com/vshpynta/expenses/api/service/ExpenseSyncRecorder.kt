package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.EventType
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.repository.ProcessedEventRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Records synchronized expense changes to the database transactionally
 *
 * This component persists expense modifications (create, update, delete) that come
 * from expense events during synchronization.
 *
 * Separated into its own component to ensure @Transactional works correctly.
 * Spring's @Transactional uses proxies - calling transactional methods from within
 * the same class bypasses the proxy and not utilizes transaction management.
 *
 * Domain responsibilities:
 * - Record synced expense changes to projections (materialized view)
 * - Track processed events (prevents reprocessing)
 * - Mark events as committed for sync coordination
 */
@Component
class ExpenseSyncRecorder(
    private val projectionRepository: ExpenseProjectionRepository,
    private val processedEventRepository: ProcessedEventRepository,
    private val eventRepository: ExpenseEventRepository
) {

    /**
     * Projects event to materialized view and commits it (idempotent)
     *
     * All operations are atomic and idempotent:
     * - projectFromEvent/markAsDeleted: Only update if new timestamp > existing (last-write-wins)
     * - markAsProcessed: Uses ON CONFLICT DO NOTHING (silently ignores duplicates)
     * - markEventsAsCommitted: Setting committed=true multiple times is safe
     *
     * Note: markEventsAsCommitted only affects events in our local expense_events table.
     * Remote events (from other devices) are never in this table, so calling this
     * on remote events has no effect (0 rows updated).
     *
     * Can be safely called multiple times with the same event - first call processes it,
     * subsequent calls have no effect. Transaction rolls back on any failure.
     *
     * @param eventEntry The expense event containing the changes
     * @param eventId Unique event identifier (for tracking/deduplication)
     * @return Always returns true (kept for potential future use)
     */
    @Transactional
    suspend fun projectAndCommitEvent(
        eventEntry: EventEntry,
        eventId: UUID
    ): Boolean = withContext(Dispatchers.IO) {
        // Apply the expense modification
        projectExpenseFromEvent(eventEntry)

        // Mark as processed in DB
        processedEventRepository.markAsProcessed(eventId)

        // Mark as committed (only affects our local events, remote events not in table)
        eventRepository.markEventsAsCommitted(listOf(eventId))

        // Return true to indicate success
        true
    }

    /**
     * Applies the expense modification based on event type
     */
    private suspend fun projectExpenseFromEvent(eventEntry: EventEntry) {
        when (EventType.valueOf(eventEntry.eventType)) {
            EventType.CREATED, EventType.UPDATED ->
                projectionRepository.projectFromEvent(eventEntry.toProjection())

            EventType.DELETED ->
                projectionRepository.markAsDeleted(
                    id = UUID.fromString(eventEntry.expenseId),
                    updatedAt = eventEntry.payload.updatedAt
                )
        }
    }

    /**
     * Converts sync event entry to expense projection
     */
    private fun EventEntry.toProjection() = ExpenseProjection(
        id = payload.id,
        description = payload.description,
        amount = payload.amount ?: 0L,
        category = payload.category,
        date = payload.date,
        updatedAt = payload.updatedAt,
        deleted = payload.deleted ?: false
    )
}
