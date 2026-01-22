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
     * Idempotent UPSERT for expense with last-write-wins conflict resolution
     *
     * Only updates if the new timestamp is newer than the existing timestamp.
     * This ensures consistent behavior for all operations (CREATE, UPDATE, DELETE).
     * The operation with the most recent timestamp always wins, regardless of operation type.
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
        WHERE EXCLUDED.updated_at > expenses.updated_at
    """
    )
    suspend fun upsertExpense(expense: SyncExpense): Int

    /**
     * Soft delete expense (idempotent) with last-write-wins conflict resolution
     *
     * Only updates if the new timestamp is newer than the existing timestamp.
     * Consistent with upsertExpense - all operations follow the same last-write-wins rule.
     *
     * Note: This method ONLY sets deleted=true, it can never undelete (resurrect) an expense.
     * To undelete, use upsertExpense() with deleted=false and a newer timestamp.
     */
    @Modifying
    @Query(
        """
        UPDATE expenses 
        SET deleted = true, updated_at = :updatedAt
        WHERE id = :id AND updated_at < :updatedAt
    """
    )
    suspend fun softDeleteExpense(id: UUID, updatedAt: Long): Int
}
