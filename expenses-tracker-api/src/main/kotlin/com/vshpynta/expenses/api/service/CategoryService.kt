package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.service.auth.UserContextService
import com.vshpynta.expenses.api.util.TimeProvider
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
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
    private val defaultCategorySeeder: DefaultCategorySeeder,
    private val timeProvider: TimeProvider,
    private val userContextService: UserContextService
) {

    companion object {
        private val logger = LoggerFactory.getLogger(CategoryService::class.java)
    }

    /**
     * Returns the user's full category catalog (active + soft-deleted),
     * triggering first-time default seeding when the user has no rows yet.
     * Callers that need active-only data filter on `deleted` client-side;
     * `useCategoryLookup` consumes the full catalog so historic expenses
     * keep their display fields after their category is archived.
     */
    fun findAllCategories(): Flow<Category> = flow {
        val userId = userContextService.currentUserId()
        ensureCategoriesExist(userId)
        emitAll(categoryRepository.findAllByUserId(userId))
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
