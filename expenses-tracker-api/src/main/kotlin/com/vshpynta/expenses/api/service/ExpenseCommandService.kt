package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.model.EventType
import com.vshpynta.expenses.api.model.ExpenseEvent
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

/**
 * Command service for expense write operations (CQRS write side)
 * Handles commands that generate events and update projections
 * Each write operation creates an event that can be synced
 */
@Service
class ExpenseCommandService(
    private val projectionRepository: ExpenseProjectionRepository,
    private val eventRepository: ExpenseEventRepository,
    private val expenseEventSyncService: ExpenseEventSyncService,
    private val objectMapper: ObjectMapper,
    private val clock: Clock = Clock.systemUTC()
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ExpenseCommandService::class.java)
    }

    /**
     * Create a new expense (write command with event generation)
     * Transactional: Both event persistence and projection update succeed or fail together
     */
    @Transactional
    suspend fun createExpense(
        description: String,
        amount: Long,
        category: String,
        date: String
    ): ExpenseProjection = withContext(Dispatchers.IO) {
        val expenseId = UUID.randomUUID()
        val now = clock.millis()

        val payload = ExpensePayload(
            id = expenseId,
            description = description,
            amount = amount,
            category = category,
            date = date,
            updatedAt = now,
            deleted = false
        )

        // 1. Append event to event store
        appendEvent(EventType.CREATED, expenseId, payload)

        // 2. Project event to read model (UPSERT)
        projectionRepository.projectFromEvent(payload.toProjection())

        logger.info("Created expense: $expenseId")

        projectionRepository.findByIdOrNull(expenseId)
            ?: error("Failed to retrieve created expense projection: $expenseId")
    }

    /**
     * Update an existing expense (write command with event generation)
     * Transactional: Both event persistence and projection update succeed or fail together
     */
    @Transactional
    suspend fun updateExpense(
        id: UUID,
        description: String?,
        amount: Long?,
        category: String?,
        date: String?
    ): ExpenseProjection? = withContext(Dispatchers.IO) {
        val existing = projectionRepository.findByIdOrNull(id) ?: return@withContext null
        val now = clock.millis()

        val payload = ExpensePayload(
            id = id,
            description = description ?: existing.description,
            amount = amount ?: existing.amount,
            category = category ?: existing.category,
            date = date ?: existing.date,
            updatedAt = now,
            deleted = false
        )

        // 1. Append event
        appendEvent(EventType.UPDATED, id, payload)

        // 2. Project to read model
        projectionRepository.projectFromEvent(payload.toProjection())

        logger.info("Updated expense: $id")

        projectionRepository.findByIdOrNull(id)
    }

    /**
     * Delete an expense (soft delete - write command with event generation)
     * Transactional: Both event persistence and projection update succeed or fail together
     */
    @Transactional
    suspend fun deleteExpense(id: UUID): Boolean = withContext(Dispatchers.IO) {
        val existing = projectionRepository.findByIdOrNull(id) ?: return@withContext false
        val now = clock.millis()

        val payload = ExpensePayload(
            id = id,
            description = existing.description,
            amount = existing.amount,
            category = existing.category,
            date = existing.date,
            updatedAt = now,
            deleted = true
        )

        // 1. Append event
        appendEvent(EventType.DELETED, id, payload)

        // 2. Mark projection as deleted
        projectionRepository.markAsDeleted(id, now)

        logger.info("Deleted expense: $id")

        true
    }

    /**
     * Helper method to append an event to the event store
     */
    private suspend fun appendEvent(
        eventType: EventType,
        expenseId: UUID,
        payload: ExpensePayload
    ): ExpenseEvent {
        val event = ExpenseEvent(
            eventId = UUID.randomUUID(),
            timestamp = clock.millis(), // now in millis
            deviceId = expenseEventSyncService.getDeviceId(),
            eventType = eventType,
            expenseId = expenseId,
            payload = objectMapper.writeValueAsString(payload),
            committed = false
        )

        return runCatching {
            eventRepository.save(event)
        }.onSuccess {
            logger.info("Appended event: ${it.eventId} (type: $eventType, expense: $expenseId)")
        }.onFailure {
            logger.error("Failed to append event for expense: $expenseId", it)
        }.getOrThrow()
    }

    /**
     * Helper method to convert payload to ExpenseProjection entity
     */
    private fun ExpensePayload.toProjection() = ExpenseProjection(
        id = id,
        description = description,
        amount = amount ?: 0L,
        category = category,
        date = date,
        updatedAt = updatedAt,
        deleted = deleted ?: false
    )
}
