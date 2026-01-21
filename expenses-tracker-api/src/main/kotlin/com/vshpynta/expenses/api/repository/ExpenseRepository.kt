package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.SyncExpense
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Repository for idempotent UPSERT operations on expenses
 * Uses Spring Data R2DBC with custom queries for database portability
 */
@Repository
interface ExpenseRepository : CoroutineCrudRepository<SyncExpense, UUID> {

    /**
     * Idempotent UPSERT for expense
     * Uses ON CONFLICT DO UPDATE with conditional WHERE clause for last-write-wins
     */
    @Modifying
    @Query(
        """
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
    """
    )
    suspend fun upsertExpense(expense: SyncExpense): Int

    /**
     * Soft delete expense (idempotent)
     * Only updates if the new timestamp is newer or expense is not already deleted
     */
    @Modifying
    @Query(
        """
        UPDATE expenses 
        SET deleted = true, updated_at = :updatedAt
        WHERE id = :id AND (updated_at < :updatedAt OR deleted = false)
    """
    )
    suspend fun softDeleteExpense(id: UUID, updatedAt: Long): Int
}
