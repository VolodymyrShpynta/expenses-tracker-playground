package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import kotlinx.coroutines.flow.Flow
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
    private val projectionRepository: ExpenseProjectionRepository
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ExpenseQueryService::class.java)
    }

    /**
     * Get all active (non-deleted) expense projections
     */
    fun getAllExpenses(): Flow<ExpenseProjection> {
        logger.debug("Querying all active expense projections")
        return projectionRepository.findAllActive()
    }

    /**
     * Get expense projection by ID
     * Returns null if not found or if deleted
     */
    suspend fun getExpenseById(id: UUID): ExpenseProjection? {
        logger.debug("Querying expense projection by id: {}", id)
        return projectionRepository.findByIdOrNull(id)
            ?.takeUnless { it.deleted }
    }

    /**
     * Check if expense exists and is active
     */
    suspend fun exists(id: UUID): Boolean {
        return projectionRepository.findByIdOrNull(id)
            ?.let { !it.deleted }
            ?: false
    }
}
