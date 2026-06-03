package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.EventType
import com.vshpynta.expenses.api.model.ExpenseEvent
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.service.ExpenseMapper.toProjection
import com.vshpynta.expenses.api.service.auth.UserContextService
import com.vshpynta.expenses.api.util.JsonOperations
import com.vshpynta.expenses.api.util.TimeProvider
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Default (business) implementation of [ExpenseCommandService].
 *
 * Knows nothing about GDPR — Art. 18 restriction enforcement is the
 * sole responsibility of the `GdprAwareExpenseCommandService`
 * decorator, which is the `@Primary` bean and the one that controllers
 * receive when they inject [ExpenseCommandService].
 *
 * Callers inside the service layer that intentionally bypass the
 * decorator (for performance — see `DataImporter`,
 * `DefaultCategoryService.mergeInto`) inject this bean via
 * `@Qualifier("defaultExpenseCommandService")`. Those call sites
 * document why they bypass.
 */
@Service("defaultExpenseCommandService")
class DefaultExpenseCommandService(
    private val projectionRepository: ExpenseProjectionRepository,
    private val eventRepository: ExpenseEventRepository,
    private val jsonOperations: JsonOperations,
    private val timeProvider: TimeProvider,
    private val userContextService: UserContextService,
) : ExpenseCommandService {

    companion object {
        private val logger = LoggerFactory.getLogger(DefaultExpenseCommandService::class.java)
    }

    @Transactional
    override suspend fun createExpense(
        description: String,
        amount: Long,
        currency: String,
        categoryId: UUID,
        date: String,
    ): ExpenseProjection {
        val userId = userContextService.currentUserId()
        val expenseId = UUID.randomUUID()
        val now = timeProvider.currentTimeMillis()

        val payload = ExpensePayload(
            id = expenseId,
            description = description,
            amount = amount,
            currency = currency,
            categoryId = categoryId,
            date = date,
            updatedAt = now,
            deleted = false,
            userId = userId
        )

        // 1. Append event to event store
        appendEvent(EventType.CREATED, expenseId, payload, userId)

        // 2. Project event to read model (UPSERT)
        projectionRepository.projectFromEvent(payload.toProjection())

        logger.info("Created expense: {}", expenseId)

        return projectionRepository.findByIdAndUserId(expenseId, userId)
            ?: error("Failed to retrieve created expense projection: $expenseId")
    }

    @Transactional
    override suspend fun updateExpense(
        id: UUID,
        description: String?,
        amount: Long?,
        currency: String?,
        categoryId: UUID?,
        date: String?,
    ): ExpenseProjection? {
        val userId = userContextService.currentUserId()
        val existing = projectionRepository.findByIdAndUserId(id, userId) ?: return null
        val now = timeProvider.currentTimeMillis()

        val payload = ExpensePayload(
            id = id,
            description = description ?: existing.description,
            amount = amount ?: existing.amount,
            currency = currency ?: existing.currency,
            categoryId = categoryId ?: existing.categoryId,
            date = date ?: existing.date,
            updatedAt = now,
            deleted = false,
            userId = userId
        )

        // 1. Append event
        appendEvent(EventType.UPDATED, id, payload, userId)

        // 2. Project to read model
        projectionRepository.projectFromEvent(payload.toProjection())

        logger.info("Updated expense: {}", id)

        return projectionRepository.findByIdAndUserId(id, userId)
    }

    @Transactional
    override suspend fun deleteExpense(id: UUID): Boolean {
        val userId = userContextService.currentUserId()
        val existing = projectionRepository.findByIdAndUserId(id, userId) ?: return false
        val now = timeProvider.currentTimeMillis()

        val payload = ExpensePayload(
            id = id,
            description = existing.description,
            amount = existing.amount,
            currency = existing.currency,
            categoryId = existing.categoryId,
            date = existing.date,
            updatedAt = now,
            deleted = true,
            userId = userId
        )

        // 1. Append event
        appendEvent(EventType.DELETED, id, payload, userId)

        // 2. Mark projection as deleted
        projectionRepository.markAsDeleted(id, now)

        logger.info("Deleted expense: {}", id)

        return true
    }

    /**
     * Helper method to append an event to the event store.
     */
    private suspend fun appendEvent(
        eventType: EventType,
        expenseId: UUID,
        payload: ExpensePayload,
        userId: String
    ): ExpenseEvent {
        val event = ExpenseEvent(
            eventId = UUID.randomUUID(),
            timestamp = timeProvider.currentTimeMillis(),
            eventType = eventType,
            expenseId = expenseId,
            payload = jsonOperations.toJson(payload),
            userId = userId
        )

        return runCatching {
            eventRepository.save(event)
        }.onSuccess {
            logger.info("Appended event: {} (type: {}, expense: {})", it.eventId, eventType, expenseId)
        }.onFailure {
            logger.error("Failed to append event for expense: {}", expenseId, it)
        }.getOrThrow()
    }
}
