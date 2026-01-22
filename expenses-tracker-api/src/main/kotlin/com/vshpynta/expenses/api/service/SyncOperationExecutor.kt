package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.OpEntry
import com.vshpynta.expenses.api.model.OperationType
import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.repository.AppliedOperationRepository
import com.vshpynta.expenses.api.repository.ExpenseRepository
import com.vshpynta.expenses.api.repository.OperationRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Executes sync operations transactionally with idempotency guarantees.
 *
 * This component is separated from SyncService to ensure @Transactional works correctly.
 * Spring's @Transactional uses proxies - calling @Transactional methods from within
 * the same class bypasses the proxy and disables transactions.
 *
 * Responsibilities:
 * - Apply expense modifications (create/update/delete)
 * - Track applied operations for idempotency
 * - Mark operations as committed for the originating device
 * - Ensure all steps are atomic (all succeed or all fail)
 */
@Component
class SyncOperationExecutor(
    private val expenseRepository: ExpenseRepository,
    private val appliedOperationRepository: AppliedOperationRepository,
    private val operationRepository: OperationRepository
) {
    private val logger = LoggerFactory.getLogger(SyncOperationExecutor::class.java)

    /**
     * Executes a single sync operation transactionally with idempotency.
     *
     * This method ensures atomicity across multiple database operations:
     * 1. Check if operation was already applied (idempotency check)
     * 2. Apply the expense modification (create/update/delete)
     * 3. Record the operation as applied
     * 4. Mark as committed if from the current device
     *
     * All steps succeed together or fail together, preventing partial application
     * which could lead to data corruption on retry.
     *
     * @param opEntry The sync operation to execute
     * @param currentDeviceId The ID of the current device
     * @return true if operation was executed, false if already applied (skip)
     */
    @Transactional
    suspend fun executeIfNotApplied(opEntry: OpEntry, currentDeviceId: String): Boolean =
        withContext(Dispatchers.IO) {
            UUID.fromString(opEntry.opId)
                .takeUnless { appliedOperationRepository.hasBeenApplied(it) }
                ?.also { opId ->
                    applyExpenseModification(opEntry)
                    appliedOperationRepository.markAsApplied(opId)

                    // Mark as committed if from current device
                    if (opEntry.deviceId == currentDeviceId) {
                        operationRepository.markOperationsAsCommitted(currentDeviceId, listOf(opId))
                    }

                    logger.debug("Executed operation: {} (type={}, entity={})",
                        opId, opEntry.opType, opEntry.entityId)
                }
                ?.let { true }
                ?: run {
                    logger.debug("Skipping already applied operation: {}", opEntry.opId)
                    false
                }
        }

    /**
     * Applies the expense modification based on operation type
     */
    private suspend fun applyExpenseModification(opEntry: OpEntry) {
        when (OperationType.valueOf(opEntry.opType)) {
            OperationType.CREATE, OperationType.UPDATE ->
                expenseRepository.upsertExpense(opEntry.toExpense())

            OperationType.DELETE ->
                expenseRepository.softDeleteExpense(
                    id = UUID.fromString(opEntry.entityId),
                    updatedAt = opEntry.payload.updatedAt
                )
        }
    }

    /**
     * Converts sync operation entry to expense entity
     */
    private fun OpEntry.toExpense() = SyncExpense(
        id = payload.id,
        description = payload.description,
        amount = payload.amount ?: 0L,
        category = payload.category,
        date = payload.date,
        updatedAt = payload.updatedAt,
        deleted = payload.deleted ?: false
    )
}
