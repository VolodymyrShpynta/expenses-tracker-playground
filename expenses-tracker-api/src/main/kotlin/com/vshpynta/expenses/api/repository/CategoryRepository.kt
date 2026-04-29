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

    /**
     * Find a single active (non-deleted) category by id for the user.
     * Soft-deleted rows are intentionally hidden so writes (update/delete)
     * cannot accidentally resurrect or re-delete an archived row — only
     * the seeder's `upsertTemplateCategory` is allowed to do that.
     */
    @Query("SELECT * FROM categories WHERE id = :id AND user_id = :userId AND deleted = false")
    suspend fun findByIdAndUserId(id: UUID, userId: String): Category?

    /**
     * Find a category by id for the user, including soft-deleted rows.
     * Used by the restore flow, which intentionally targets archived rows.
     */
    @Query("SELECT * FROM categories WHERE id = :id AND user_id = :userId")
    suspend fun findByIdAndUserIdIncludingDeleted(id: UUID, userId: String): Category?

    /**
     * Returns the user's full category catalog (active + soft-deleted),
     * ordered for stable display. Soft-deleted rows are included so the
     * frontend's `useCategoryLookup` can resolve display fields for
     * historic expenses whose category was archived. The frontend's
     * `useCategories()` filters `deleted = false` for active-only views.
     */
    @Query("SELECT * FROM categories WHERE user_id = :userId ORDER BY sort_order, COALESCE(name, '')")
    fun findAllByUserId(userId: String): Flow<Category>

    /**
     * Upsert category with last-write-wins conflict resolution by primary key.
     * Used for ordinary writes (create / update / sync) where we know the
     * exact row id. Only commits when the incoming timestamp is newer than
     * the stored one.
     */
    @Modifying
    @Query(
        """
        INSERT INTO categories (id, name, icon, color, sort_order, updated_at, deleted, user_id, template_key)
        VALUES (:#{#category.categoryId}, :#{#category.name}, :#{#category.icon}, :#{#category.color},
                :#{#category.sortOrder}, :#{#category.updatedAt}, :#{#category.deleted}, :#{#category.userId},
                :#{#category.templateKey})
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            icon = EXCLUDED.icon,
            color = EXCLUDED.color,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at,
            deleted = EXCLUDED.deleted,
            template_key = EXCLUDED.template_key
        WHERE EXCLUDED.updated_at > categories.updated_at
    """
    )
    suspend fun upsertCategory(category: Category): Int

    /**
     * Upsert a template-backed category keyed by `(user_id, template_key)`.
     *
     * Used by both the first-time seeder and the "reset to defaults" action:
     * - **Insert path** — user has never had this template → row is created.
     * - **Update path** — user renamed / recolored / soft-deleted the template
     *   row → row is reset to the canonical name/icon/color/sort_order from
     *   the template and resurrected (`deleted = false`).
     *
     * Custom categories (`template_key IS NULL`) are excluded from the
     * partial unique index used as the conflict target, so they never collide.
     *
     * The supplied `category.templateKey` MUST be non-null; this method is
     * not meant for user-created customs.
     */
    @Modifying
    @Query(
        """
        INSERT INTO categories (id, name, icon, color, sort_order, updated_at, deleted, user_id, template_key)
        VALUES (:#{#category.categoryId}, :#{#category.name}, :#{#category.icon}, :#{#category.color},
                :#{#category.sortOrder}, :#{#category.updatedAt}, false, :#{#category.userId},
                :#{#category.templateKey})
        ON CONFLICT (user_id, template_key) WHERE template_key IS NOT NULL DO UPDATE SET
            name = EXCLUDED.name,
            icon = EXCLUDED.icon,
            color = EXCLUDED.color,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at,
            deleted = false
    """
    )
    suspend fun upsertTemplateCategory(category: Category): Int

    @Modifying
    @Query(
        """
        UPDATE categories 
        SET deleted = true, updated_at = :updatedAt
        WHERE id = :id AND updated_at < :updatedAt
    """
    )
    suspend fun markAsDeleted(id: UUID, updatedAt: Long): Int

    /**
     * Soft-delete every active **custom** category for the user (rows with
     * `template_key IS NULL`). Used by the "reset to defaults" flow to wipe
     * user-added categories without touching templated ones (those are
     * handled by [upsertTemplateCategory]).
     *
     * Soft delete is intentional: existing expenses keep their `category_id`
     * reference and render with the orphan placeholder via the frontend's
     * `useCategoryLookup`. Hard-deleting would lose that audit trail.
     */
    @Modifying
    @Query(
        """
        UPDATE categories
        SET deleted = true, updated_at = :updatedAt
        WHERE user_id = :userId AND template_key IS NULL AND deleted = false
    """
    )
    suspend fun softDeleteCustomCategories(userId: String, updatedAt: Long): Int
}
