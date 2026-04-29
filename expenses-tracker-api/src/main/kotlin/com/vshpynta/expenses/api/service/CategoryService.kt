package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.service.auth.UserContextService
import com.vshpynta.expenses.api.util.TimeProvider
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.toList
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Service for managing user-configurable expense categories.
 * Simple CRUD with last-write-wins conflict resolution for sync.
 * Seeds default categories from the default_categories table on first access for new users.
 */
@Service
class CategoryService(
    private val categoryRepository: CategoryRepository,
    private val projectionRepository: ExpenseProjectionRepository,
    private val expenseCommandService: ExpenseCommandService,
    private val defaultCategorySeeder: DefaultCategorySeeder,
    private val timeProvider: TimeProvider,
    private val userContextService: UserContextService
) {

    companion object {
        private val logger = LoggerFactory.getLogger(CategoryService::class.java)
    }

    /**
     * Catalog augmented with the number of active expenses each category
     * has. Used by the controller to surface `activeExpenseCount` on the
     * DTO so the frontend can suppress the "merge archived twins"
     * affordance for archived rows that have no stranded expenses left.
     *
     * Returns the user's full catalog (active + soft-deleted) and
     * triggers first-time default seeding when the user has no rows yet.
     * The count aggregate is collected up-front (small — one row per
     * category referenced by an active expense) so the resulting Flow
     * can stream categories lazily without a per-row count query.
     */
    fun findAllCategoriesWithExpenseCounts(): Flow<Pair<Category, Long>> = flow {
        val userId = userContextService.currentUserId()
        ensureCategoriesExist(userId)
        val counts = projectionRepository
            .aggregateActiveExpenseCountsByCategory(userId)
            .toList()
            .associate { it.categoryId to it.expenseCount }
        emitAll(
            categoryRepository.findAllByUserId(userId)
                .map { it to (counts[it.categoryId] ?: 0L) }
        )
    }

    suspend fun findCategoryById(id: UUID): Category? {
        val userId = userContextService.currentUserId()
        return categoryRepository.findByIdAndUserId(id, userId)
    }

    @Transactional
    suspend fun createCategory(
        name: String,
        icon: String,
        color: String,
        sortOrder: Int = 0
    ): Category {
        val userId = userContextService.currentUserId()
        val category = Category(
            name = name,
            icon = icon,
            color = color,
            sortOrder = sortOrder,
            updatedAt = timeProvider.currentTimeMillis(),
            userId = userId
        )
        categoryRepository.upsertCategory(category)
        logger.info("Created category: {}", category.id)
        return category
    }

    @Transactional
    suspend fun updateCategory(
        id: UUID,
        name: String? = null,
        icon: String? = null,
        color: String? = null,
        sortOrder: Int? = null
    ): Category? {
        val userId = userContextService.currentUserId()
        val existing = categoryRepository.findByIdAndUserId(id, userId) ?: return null
        // For templated rows, an explicit blank name clears the override and
        // restores the translated template label on the frontend. For custom
        // (non-templated) rows we ignore blanks to keep the CHECK constraint
        // happy — the frontend's form-level validation already rejects them.
        val nextName = when {
            name == null -> existing.name
            name.isBlank() && existing.templateKey != null -> null
            name.isBlank() -> existing.name
            else -> name
        }
        val updated = existing.copy(
            name = nextName,
            icon = icon ?: existing.icon,
            color = color ?: existing.color,
            sortOrder = sortOrder ?: existing.sortOrder,
            updatedAt = timeProvider.currentTimeMillis()
        )
        categoryRepository.upsertCategory(updated)
        logger.info("Updated category: {}", id)
        return updated
    }

    @Transactional
    suspend fun deleteCategory(id: UUID): Boolean {
        val rows = categoryRepository.markAsDeleted(id, timeProvider.currentTimeMillis())
        if (rows > 0) {
            logger.info("Deleted category: {}", id)
        }
        return rows > 0
    }

    /**
     * Resurrect a soft-deleted category. Returns `null` if the row doesn't
     * exist, doesn't belong to the user, or is already active. Used by the
     * "restore on duplicate name" flow on the frontend: when a user tries
     * to add a custom category whose name matches an archived row, they
     * are offered to restore the archived row instead of creating a new one,
     * so historic expenses keep flowing into the same category.
     */
    @Transactional
    suspend fun restoreCategory(id: UUID): Category? {
        val userId = userContextService.currentUserId()
        val existing = categoryRepository.findByIdAndUserIdIncludingDeleted(id, userId) ?: return null
        if (!existing.deleted) return existing
        val restored = existing.copy(
            deleted = false,
            updatedAt = timeProvider.currentTimeMillis()
        )
        categoryRepository.upsertCategory(restored)
        logger.info("Restored category: {}", id)
        return restored
    }

    /**
     * Merge `sourceId` into `targetId`: every active expense currently
     * categorised as `source` is re-categorised as `target` (one
     * `EXPENSE_UPDATED` event per expense, so the change replicates via
     * sync), then `source` is soft-deleted.
     *
     * Both categories must belong to the current user; `target` must be
     * active and distinct from `source`. Returns the (active) target
     * category, or `null` when validation fails.
     *
     * Wrapped in a single `@Transactional` boundary: a failure mid-loop
     * rolls back the entire merge so the user never observes a half-merged
     * state. The inner `@Transactional` on
     * [ExpenseCommandService.updateExpense] joins this transaction
     * (propagation REQUIRED).
     */
    @Transactional
    suspend fun mergeInto(sourceId: UUID, targetId: UUID): Category? {
        if (sourceId == targetId) return null
        val userId = userContextService.currentUserId()
        // Source may be active or already-archived (idempotent merge — a
        // retried request still works). Target must be active.
        val source = categoryRepository.findByIdAndUserIdIncludingDeleted(sourceId, userId) ?: return null
        val target = categoryRepository.findByIdAndUserId(targetId, userId) ?: return null
        if (source.userId != userId || target.userId != userId) return null

        // Snapshot the affected expenses up-front; we cannot iterate the
        // Flow lazily while issuing further R2DBC writes on the same
        // connection.
        val affected = projectionRepository.findActiveByUserIdAndCategoryId(userId, sourceId).toList()
        affected.forEach { expense ->
            expenseCommandService.updateExpense(
                id = expense.id,
                description = null,
                amount = null,
                currency = null,
                categoryId = targetId,
                date = null
            )
        }

        if (!source.deleted) {
            categoryRepository.markAsDeleted(sourceId, timeProvider.currentTimeMillis())
        }
        logger.info(
            "Merged category {} into {} ({} expenses re-categorised)",
            sourceId, targetId, affected.size
        )
        return target
    }

    /**
     * Factory-reset the user's category list:
     * 1. Soft-delete every active **custom** category (`template_key IS NULL`).
     *    Existing expenses keep their `category_id` reference and render with
     *    the orphan placeholder.
     * 2. Re-apply the default templates: renames/recolors are reverted,
     *    soft-deleted templates are resurrected.
     *
     * Wrapped in a single `@Transactional` boundary so a partial failure
     * (e.g. DB error halfway through the upsert loop) leaves no orphan state.
     * The inner `@Transactional` on [DefaultCategorySeeder.seedDefaultCategories]
     * joins this transaction (propagation REQUIRED), keeping a single rollback
     * point.
     *
     * Used by Settings → Manage Categories → "Reset to defaults".
     */
    @Transactional
    suspend fun resetToDefaults() {
        val userId = userContextService.currentUserId()
        val now = timeProvider.currentTimeMillis()
        val wiped = categoryRepository.softDeleteCustomCategories(userId, now)
        if (wiped > 0) {
            logger.info("Soft-deleted {} custom categories for user: {}", wiped, userId)
        }
        defaultCategorySeeder.seedDefaultCategories(userId)
    }

    private suspend fun ensureCategoriesExist(userId: String) {
        if (categoryRepository.countByUserId(userId) == 0L) {
            defaultCategorySeeder.seedDefaultCategories(userId)
        }
    }
}
