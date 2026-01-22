package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
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
    suspend fun getAllExpenses(): Flow<ExpenseProjection> = withContext(Dispatchers.IO) {
        logger.debug("Querying all active expense projections")
        projectionRepository.findAllActive()
    }

    /**
     * Get expense projection by ID
     * Returns null if not found or if deleted
     */
    suspend fun getExpenseById(id: UUID): ExpenseProjection? = withContext(Dispatchers.IO) {
        logger.debug("Querying expense projection by id: {}", id)
        projectionRepository.findByIdOrNull(id)
            ?.takeUnless { it.deleted }
    }

    /**
     * Check if expense exists and is active
     */
    suspend fun exists(id: UUID): Boolean = withContext(Dispatchers.IO) {
        projectionRepository.findByIdOrNull(id)
            ?.let { !it.deleted }
            ?: false
    }
}
