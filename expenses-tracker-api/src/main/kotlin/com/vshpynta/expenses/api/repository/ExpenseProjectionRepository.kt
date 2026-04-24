package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.ExpenseProjection
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Repository for expense projections (materialized view, read model)
 * Manages the query-optimized view of expenses rebuilt from events
 * Contains idempotent projection methods with last-write-wins conflict resolution based on timestamps.
 * Uses Spring Data R2DBC with custom queries for database portability.
 */
@Repository
interface ExpenseProjectionRepository : CoroutineCrudRepository<ExpenseProjection, UUID> {

    /**
     * Find expense projection by ID and user (returns null if not found)
     */
    @Query("SELECT * FROM expense_projections WHERE id = :id AND user_id = :userId")
    suspend fun findByIdAndUserId(id: UUID, userId: String): ExpenseProjection?

    /**
     * Find all active (non-deleted) expense projections for a user
     */
    @Query("SELECT * FROM expense_projections WHERE deleted = false AND user_id = :userId")
    fun findAllActiveByUserId(userId: String): Flow<ExpenseProjection>

    /**
     * Project expense from event with last-write-wins conflict resolution
     * (Idempotent UPSERT operation)
     *
     * Only updates if the new timestamp is newer than the existing timestamp.
     * This ensures consistent behavior for all event types (CREATED, UPDATED, DELETED).
     * The event with the most recent timestamp always wins, regardless of event type.
     */
    @Modifying
    @Query(
        """
        INSERT INTO expense_projections (id, description, amount, currency, category_id, date, updated_at, deleted, user_id)
        VALUES (:#{#projection.id}, :#{#projection.description}, :#{#projection.amount},
                :#{#projection.currency}, :#{#projection.categoryId}, :#{#projection.date},
                :#{#projection.updatedAt}, :#{#projection.deleted}, :#{#projection.userId})
        ON CONFLICT (id) DO UPDATE SET
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            currency = EXCLUDED.currency,
            category_id = EXCLUDED.category_id,
            date = EXCLUDED.date,
            updated_at = EXCLUDED.updated_at,
            deleted = EXCLUDED.deleted
        WHERE EXCLUDED.updated_at > expense_projections.updated_at
    """
    )
    suspend fun projectFromEvent(projection: ExpenseProjection): Int

    /**
     * Mark projection as deleted (idempotent) with last-write-wins conflict resolution
     *
     * Only updates if the new timestamp is newer than the existing timestamp.
     * Consistent with projectFromEvent - all operations follow the same last-write-wins rule.
     *
     * Note: This method ONLY sets deleted=true, it can never undelete (resurrect) an expense.
     * To undelete, use projectFromEvent() with deleted=false and a newer timestamp.
     */
    @Modifying
    @Query(
        """
        UPDATE expense_projections 
        SET deleted = true, updated_at = :updatedAt
        WHERE id = :id AND updated_at < :updatedAt
    """
    )
    suspend fun markAsDeleted(id: UUID, updatedAt: Long): Int
}
