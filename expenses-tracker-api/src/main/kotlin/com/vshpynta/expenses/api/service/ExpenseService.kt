package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.Operation
import com.vshpynta.expenses.api.model.OperationType
import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.repository.ExpenseRepository
import com.vshpynta.expenses.api.repository.OperationRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

/**
 * Service for writing expenses with event sourcing
 * Each write operation creates an Op that can be synced
 */
@Service
class ExpenseService(
    private val expenseRepository: ExpenseRepository,
    private val operationRepository: OperationRepository,
    private val syncService: SyncService,
    private val objectMapper: ObjectMapper,
    private val clock: Clock = Clock.systemUTC()
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ExpenseService::class.java)
    }

    /**
     * Create a new expense (write with operation generation)
     * Transactional: Both operation insertion and expense creation succeed or fail together
     */
    @Transactional
    suspend fun createExpense(
        description: String,
        amount: Long,
        category: String,
        date: String
    ): SyncExpense = withContext(Dispatchers.IO) {
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

        // 1. Save operation to operations table
        saveOperation(OperationType.CREATE, expenseId, payload)

        // 2. Apply effect to expenses table (UPSERT)
        expenseRepository.upsertExpense(payload.toSyncExpense())

        logger.info("Created expense: $expenseId")

        expenseRepository.findByIdOrNull(expenseId)
            ?: error("Failed to retrieve created expense: $expenseId")
    }

    /**
     * Update an existing expense
     * Transactional: Both operation insertion and expense update succeed or fail together
     */
    @Transactional
    suspend fun updateExpense(
        id: UUID,
        description: String?,
        amount: Long?,
        category: String?,
        date: String?
    ): SyncExpense? = withContext(Dispatchers.IO) {
        val existing = expenseRepository.findByIdOrNull(id) ?: return@withContext null
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

        // 1. Save operation
        saveOperation(OperationType.UPDATE, id, payload)

        // 2. Apply effect
        expenseRepository.upsertExpense(payload.toSyncExpense())

        logger.info("Updated expense: $id")

        expenseRepository.findByIdOrNull(id)
    }

    /**
     * Delete an expense (soft delete)
     * Transactional: Both operation insertion and soft delete succeed or fail together
     */
    @Transactional
    suspend fun deleteExpense(id: UUID): Boolean = withContext(Dispatchers.IO) {
        val existing = expenseRepository.findByIdOrNull(id) ?: return@withContext false
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

        // 1. Save operation
        saveOperation(OperationType.DELETE, id, payload)

        // 2. Apply soft delete
        expenseRepository.softDeleteExpense(id, now)

        logger.info("Deleted expense: $id")

        true
    }

    /**
     * Get all active (non-deleted) expenses
     */
    suspend fun getAllExpenses(): Flow<SyncExpense> = withContext(Dispatchers.IO) {
        expenseRepository.findAllActive()
    }

    /**
     * Get expense by ID (returns null if deleted)
     */
    suspend fun getExpenseById(id: UUID): SyncExpense? = withContext(Dispatchers.IO) {
        expenseRepository.findByIdOrNull(id)
            ?.takeIf { !it.deleted }
    }

    /**
     * Helper method to create and save an operation
     */
    private suspend fun saveOperation(
        operationType: OperationType,
        entityId: UUID,
        payload: ExpensePayload
    ): Operation {
        val now = clock.millis()
        val operation = Operation(
            opId = UUID.randomUUID(),
            ts = now,
            deviceId = syncService.getDeviceId(),
            operationType = operationType,
            entityId = entityId,
            payload = objectMapper.writeValueAsString(payload),
            committed = false
        )

        return runCatching {
            operationRepository.save(operation)
        }.onSuccess {
            logger.info("Saved operation: ${it.opId} (type: $operationType, entity: $entityId)")
        }.onFailure {
            logger.error("Failed to save operation for entity: $entityId", it)
        }.getOrThrow()
    }

    /**
     * Helper method to convert payload to SyncExpense entity
     */
    private fun ExpensePayload.toSyncExpense() = SyncExpense(
        id = id,
        description = description,
        amount = amount ?: 0L,
        category = category,
        date = date,
        updatedAt = updatedAt,
        deleted = deleted ?: false
    )
}
