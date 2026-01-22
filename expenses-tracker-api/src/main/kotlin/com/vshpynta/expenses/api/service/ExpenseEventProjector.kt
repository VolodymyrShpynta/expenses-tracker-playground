package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.EventType
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ProcessedEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Projects expense events to the materialized view (expense projections) with idempotency guarantees
 *
 * This component is separated from ExpenseEventSyncService to ensure @Transactional works correctly.
 * Spring's @Transactional uses proxies - calling @Transactional methods from within
 * the same class bypasses the proxy and disables transactions.
 *
 * Responsibilities:
 * - Project expense events to read model (create/update/delete projections)
 * - Track processed events for idempotency
 * - Mark events as committed for the originating device
 * - Ensure all steps are atomic (all succeed or all fail)
 */
@Component
class ExpenseEventProjector(
    private val projectionRepository: ExpenseProjectionRepository,
    private val processedEventRepository: ProcessedEventRepository,
    private val eventRepository: ExpenseEventRepository
) {
    private val logger = LoggerFactory.getLogger(ExpenseEventProjector::class.java)

    /**
     * Projects a single event transactionally with idempotency
     *
     * This method ensures atomicity across multiple database operations:
     * 1. Check if event was already processed (idempotency check)
     * 2. Apply the expense modification (CREATED/UPDATED/DELETED)
     * 3. Record the event as processed
     * 4. Mark as committed if from the current device
     *
     * All steps succeed together or fail together, preventing partial application
     * which could lead to data corruption on retry.
     *
     * @param eventEntry The sync event to execute
     * @param currentDeviceId The ID of the current device
     * @return true if event was executed, false if already processed (skip)
     */
    @Transactional
    suspend fun projectIfNotProcessed(eventEntry: EventEntry, currentDeviceId: String): Boolean =
        withContext(Dispatchers.IO) {
            UUID.fromString(eventEntry.eventId)
                .takeUnless { processedEventRepository.hasBeenProcessed(it) }
                ?.also { eventId ->
                    projectExpenseFromEvent(eventEntry)
                    processedEventRepository.markAsProcessed(eventId)

                    // Mark as committed if from current device
                    if (eventEntry.deviceId == currentDeviceId) {
                        eventRepository.markEventsAsCommitted(currentDeviceId, listOf(eventId))
                    }

                    logger.debug("Executed event: {} (type={}, expense={})",
                        eventId, eventEntry.eventType, eventEntry.expenseId)
                }
                ?.let { true }
                ?: run {
                    logger.debug("Skipping already processed event: {}", eventEntry.eventId)
                    false
                }
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
