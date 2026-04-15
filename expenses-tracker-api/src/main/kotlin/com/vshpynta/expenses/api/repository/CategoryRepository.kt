package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.Category
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Repository for user-configurable expense categories.
 * Uses idempotent UPSERT with last-write-wins conflict resolution for sync compatibility.
 */
@Repository
interface CategoryRepository : CoroutineCrudRepository<Category, UUID> {

    @Query("SELECT COUNT(*) FROM categories WHERE user_id = :userId")
    suspend fun countByUserId(userId: String): Long

    @Query("SELECT * FROM categories WHERE id = :id AND user_id = :userId AND deleted = false")
    suspend fun findByIdAndUserId(id: UUID, userId: String): Category?

    @Query("SELECT * FROM categories WHERE deleted = false AND user_id = :userId ORDER BY sort_order, name")
    fun findAllActiveByUserId(userId: String): Flow<Category>

    /**
     * Upsert category with last-write-wins conflict resolution.
     * Only updates if the new timestamp is newer than the existing one.
     */
    @Modifying
    @Query(
        """
        INSERT INTO categories (id, name, icon, color, sort_order, updated_at, deleted, user_id)
        VALUES (:#{#category.categoryId}, :#{#category.name}, :#{#category.icon}, :#{#category.color},
                :#{#category.sortOrder}, :#{#category.updatedAt}, :#{#category.deleted}, :#{#category.userId})
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            icon = EXCLUDED.icon,
            color = EXCLUDED.color,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at,
            deleted = EXCLUDED.deleted
        WHERE EXCLUDED.updated_at > categories.updated_at
    """
    )
    suspend fun upsertCategory(category: Category): Int

    @Modifying
    @Query(
        """
        UPDATE categories 
        SET deleted = true, updated_at = :updatedAt
        WHERE id = :id AND updated_at < :updatedAt
    """
    )
    suspend fun markAsDeleted(id: UUID, updatedAt: Long): Int
}
