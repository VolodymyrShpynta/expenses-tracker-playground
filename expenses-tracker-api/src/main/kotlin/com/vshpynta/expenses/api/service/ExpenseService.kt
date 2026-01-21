package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.Operation
import com.vshpynta.expenses.api.model.OperationType
import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.repository.ExpenseRepository
import com.vshpynta.expenses.api.repository.OperationRepository
import com.vshpynta.expenses.api.repository.SyncExpenseRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Service for writing expenses with event sourcing
 * Each write operation creates an Op that can be synced
 */
@Service
class ExpenseService(
    private val syncExpenseRepository: SyncExpenseRepository,
    private val expenseRepository: ExpenseRepository,
    private val operationRepository: OperationRepository,
    private val syncService: SyncService,
    private val objectMapper: ObjectMapper
) {
    private val logger = LoggerFactory.getLogger(ExpenseService::class.java)

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
        val now = System.currentTimeMillis()
        val expenseId = UUID.randomUUID()
        val opId = UUID.randomUUID()

        val payload = ExpensePayload(
            id = expenseId,
            description = description,
            amount = amount,
            category = category,
            date = date,
            updatedAt = now,
            deleted = false
        )

        // 1. Insert operation into operations table
        val savedOperation = try {
            operationRepository.save(
                Operation(
                    opId = opId,
                    ts = now,
                    deviceId = syncService.getDeviceId(),
                    operationType = OperationType.CREATE,
                    entityId = expenseId,
                    payload = objectMapper.writeValueAsString(payload),
                    committed = false
                )
            )
        } catch (e: Exception) {
            logger.error("Failed to save operation", e)
            throw e
        }
        logger.info("Saved operation: ${savedOperation.opId}")

        // 2. Apply effect to expenses table (UPSERT)
        expenseRepository.upsertExpense(
            SyncExpense(
                id = payload.id,
                description = payload.description,
                amount = payload.amount ?: 0L,
                category = payload.category,
                date = payload.date,
                updatedAt = payload.updatedAt,
                deleted = payload.deleted ?: false
            )
        )

        logger.info("Created expense: $expenseId with op: $opId")

        syncExpenseRepository.findByIdOrNull(expenseId)!!
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
        val existing = syncExpenseRepository.findByIdOrNull(id) ?: return@withContext null

        val now = System.currentTimeMillis()
        val opId = UUID.randomUUID()

        val payload = ExpensePayload(
            id = id,
            description = description ?: existing.description,
            amount = amount ?: existing.amount,
            category = category ?: existing.category,
            date = date ?: existing.date,
            updatedAt = now,
            deleted = false
        )

        // 1. Insert operation
        operationRepository.save(
            Operation(
                opId = opId,
                ts = now,
                deviceId = syncService.getDeviceId(),
                operationType = OperationType.UPDATE,
                entityId = id,
                payload = objectMapper.writeValueAsString(payload),
                committed = false
            )
        )

        // 2. Apply effect
        expenseRepository.upsertExpense(
            SyncExpense(
                id = payload.id,
                description = payload.description,
                amount = payload.amount ?: 0L,
                category = payload.category,
                date = payload.date,
                updatedAt = payload.updatedAt,
                deleted = payload.deleted ?: false
            )
        )

        logger.info("Updated expense: $id with op: $opId")

        syncExpenseRepository.findByIdOrNull(id)
    }

    /**
     * Delete an expense (soft delete)
     * Transactional: Both operation insertion and soft delete succeed or fail together
     */
    @Transactional
    suspend fun deleteExpense(id: UUID): Boolean = withContext(Dispatchers.IO) {
        val existing = syncExpenseRepository.findByIdOrNull(id) ?: return@withContext false

        val now = System.currentTimeMillis()
        val opId = UUID.randomUUID()

        val payload = ExpensePayload(
            id = id,
            description = existing.description,
            amount = existing.amount,
            category = existing.category,
            date = existing.date,
            updatedAt = now,
            deleted = true
        )

        // 1. Insert operation
        operationRepository.save(
            Operation(
                opId = opId,
                ts = now,
                deviceId = syncService.getDeviceId(),
                operationType = OperationType.DELETE,
                entityId = id,
                payload = objectMapper.writeValueAsString(payload),
                committed = false
            )
        )

        // 2. Apply soft delete
        expenseRepository.softDeleteExpense(id, now)

        logger.info("Deleted expense: $id with op: $opId")

        true
    }

    /**
     * Get all active (non-deleted) expenses
     */
    suspend fun getAllExpenses(): Flow<SyncExpense> = withContext(Dispatchers.IO) {
        syncExpenseRepository.findAllActive()
    }

    /**
     * Get expense by ID
     */
    suspend fun getExpenseById(id: UUID): SyncExpense? = withContext(Dispatchers.IO) {
        val expense = syncExpenseRepository.findByIdOrNull(id)
        if (expense?.deleted == true) null else expense
    }
}
