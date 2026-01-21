package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.Operation
import com.vshpynta.expenses.api.model.OperationType
import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.repository.ExpenseUpsertRepository
import com.vshpynta.expenses.api.repository.OperationUpsertRepository
import com.vshpynta.expenses.api.repository.SyncExpenseRepository
import kotlinx.coroutines.flow.Flow
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Service for writing expenses with event sourcing
 * Each write operation creates an Op that can be synced
 */
@Service
class ExpenseWriteService(
    private val syncExpenseRepository: SyncExpenseRepository,
    private val upsertRepository: ExpenseUpsertRepository,
    private val operationRepository: OperationUpsertRepository,
    private val syncService: SyncService,
    private val objectMapper: ObjectMapper
) {
    private val logger = LoggerFactory.getLogger(ExpenseWriteService::class.java)

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
    ): SyncExpense {
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
        upsertRepository.upsertExpense(
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

        return syncExpenseRepository.findByIdOrNull(expenseId)!!
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
    ): SyncExpense? {
        val existing = syncExpenseRepository.findByIdOrNull(id) ?: return null

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
        upsertRepository.upsertExpense(
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

        return syncExpenseRepository.findByIdOrNull(id)
    }

    /**
     * Delete an expense (soft delete)
     * Transactional: Both operation insertion and soft delete succeed or fail together
     */
    @Transactional
    suspend fun deleteExpense(id: UUID): Boolean {
        val existing = syncExpenseRepository.findByIdOrNull(id) ?: return false

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
        upsertRepository.softDeleteExpense(id, now)

        logger.info("Deleted expense: $id with op: $opId")

        return true
    }

    /**
     * Get all active (non-deleted) expenses
     */
    suspend fun getAllExpenses(): Flow<SyncExpense> {
        return syncExpenseRepository.findAllActive()
    }

    /**
     * Get expense by ID
     */
    suspend fun getExpenseById(id: UUID): SyncExpense? {
        val expense = syncExpenseRepository.findByIdOrNull(id)
        return if (expense?.deleted == true) null else expense
    }
}
