package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.Operation
import com.vshpynta.expenses.api.model.SyncExpense
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.*

/**
 * Repository for idempotent UPSERT operations on expenses
 * Uses Spring Data R2DBC with custom queries for database portability
 */
@Repository
interface ExpenseUpsertRepository : CoroutineCrudRepository<SyncExpense, UUID> {

    /**
     * Idempotent UPSERT for expense
     * Uses ON CONFLICT DO UPDATE with conditional WHERE clause for last-write-wins
     */
    @Modifying
    @Query("""
        INSERT INTO expenses (id, description, amount, category, date, updated_at, deleted)
        VALUES (:#{#expense.id}, :#{#expense.description}, :#{#expense.amount}, 
                :#{#expense.category}, :#{#expense.date}, :#{#expense.updatedAt}, :#{#expense.deleted})
        ON CONFLICT (id) DO UPDATE SET
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            category = EXCLUDED.category,
            date = EXCLUDED.date,
            updated_at = EXCLUDED.updated_at,
            deleted = EXCLUDED.deleted
        WHERE EXCLUDED.updated_at > expenses.updated_at OR EXCLUDED.deleted = true
    """)
    suspend fun upsertExpense(expense: SyncExpense): Int

    /**
     * Soft delete expense (idempotent)
     * Only updates if the new timestamp is newer or expense is not already deleted
     */
    @Modifying
    @Query("""
        UPDATE expenses 
        SET deleted = true, updated_at = :updatedAt
        WHERE id = :id AND (updated_at < :updatedAt OR deleted = false)
    """)
    suspend fun softDeleteExpense(id: UUID, updatedAt: Long): Int
}

/**
 * Repository for operation log entries
 */
@Repository
interface OperationUpsertRepository : CoroutineCrudRepository<Operation, UUID> {

    /**
     * Insert operation into operations table
     * Note: Spring Data handles the insert automatically, this is just for clarity
     */
    // No custom query needed - use save() from CoroutineCrudRepository

    /**
     * Mark operations as committed for a device
     */
    @Modifying
    @Query("""
        UPDATE operations SET committed = true
        WHERE device_id = :deviceId AND op_id IN (:opIds)
    """)
    suspend fun markOperationsAsCommitted(deviceId: String, opIds: List<UUID>): Int

    /**
     * Find uncommitted operations for a device
     */
    @Query("SELECT * FROM operations WHERE device_id = :deviceId AND committed = false")
    suspend fun findUncommittedOperations(deviceId: String): List<Operation>
}

