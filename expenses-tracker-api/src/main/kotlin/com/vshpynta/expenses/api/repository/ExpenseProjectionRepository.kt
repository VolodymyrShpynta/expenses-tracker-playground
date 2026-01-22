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
     * Find expense projection by ID (returns null if not found)
     */
    @Query("SELECT * FROM expense_projections WHERE id = :id")
    suspend fun findByIdOrNull(id: UUID): ExpenseProjection?

    /**
     * Find all active (non-deleted) expense projections
     */
    @Query("SELECT * FROM expense_projections WHERE deleted = false")
    suspend fun findAllActive(): Flow<ExpenseProjection>

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
        INSERT INTO expense_projections (id, description, amount, category, date, updated_at, deleted)
        VALUES (:#{#projection.id}, :#{#projection.description}, :#{#projection.amount}, 
                :#{#projection.category}, :#{#projection.date}, :#{#projection.updatedAt}, :#{#projection.deleted})
        ON CONFLICT (id) DO UPDATE SET
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            category = EXCLUDED.category,
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
