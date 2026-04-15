package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.service.auth.UserContextService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.util.UUID

/**
 * Query service for expense read operations (CQRS read side)
 * Handles queries against the materialized view (expense projections)
 * All methods read from the projection table, not the event store
 */
@Service
class ExpenseQueryService(
    private val projectionRepository: ExpenseProjectionRepository,
    private val userContextService: UserContextService
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ExpenseQueryService::class.java)
    }

    /**
     * Find all active (non-deleted) expense projections for the current user
     */
    fun findAllExpenses(): Flow<ExpenseProjection> = flow {
        val userId = userContextService.currentUserId()
        logger.debug("Querying all active expense projections for user: {}", userId)
        emitAll(projectionRepository.findAllActiveByUserId(userId))
    }

    /**
     * Find expense projection by ID for the current user
     * Returns null if not found or if deleted
     */
    suspend fun findExpenseById(id: UUID): ExpenseProjection? {
        val userId = userContextService.currentUserId()
        logger.debug("Querying expense projection by id: {} for user: {}", id, userId)
        return projectionRepository.findByIdAndUserId(id, userId)
            ?.takeUnless { it.deleted }
    }

    /**
     * Check if expense exists and is active for the current user
     */
    suspend fun exists(id: UUID): Boolean {
        val userId = userContextService.currentUserId()
        return projectionRepository.findByIdAndUserId(id, userId)
            ?.let { !it.deleted }
            ?: false
    }
}
