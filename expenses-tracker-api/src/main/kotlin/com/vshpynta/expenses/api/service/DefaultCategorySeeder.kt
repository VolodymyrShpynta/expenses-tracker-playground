package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.repository.DefaultCategoryRepository
import com.vshpynta.expenses.api.util.TimeProvider
import kotlinx.coroutines.flow.toList
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Seeds default categories for new users from the `default_categories`
 * template table, and re-seeds (resets) for existing users.
 *
 * The same code path serves both flows because the underlying upsert is
 * idempotent and keyed by `(user_id, template_key)`:
 * - First-time seed (count == 0) -> all rows are inserted with `name = NULL`,
 *   leaving display names to the frontend i18n layer.
 * - Reset -> existing template rows are reverted to canonical
 *   `name = NULL` / icon / color / sort_order and resurrected if soft-deleted;
 *   user-added custom categories (`template_key IS NULL`) are not touched.
 *
 * Extracted as a separate `@Component` so Spring's `@Transactional` proxy
 * works correctly when called from `CategoryService` (avoids self-invocation
 * proxy bypass).
 */
@Component
class DefaultCategorySeeder(
    private val categoryRepository: CategoryRepository,
    private val defaultCategoryRepository: DefaultCategoryRepository,
    private val timeProvider: TimeProvider
) {

    companion object {
        private val logger = LoggerFactory.getLogger(DefaultCategorySeeder::class.java)
    }

    /**
     * Apply (or re-apply) the default category set for the given user.
     * Templated rows are written with `name = null`; the frontend renders
     * the translated label by `template_key`.
     */
    @Transactional
    suspend fun seedDefaultCategories(userId: String) {
        val now = timeProvider.currentTimeMillis()
        val defaults = defaultCategoryRepository.findAllOrdered().toList()
        defaults.forEach { default ->
            categoryRepository.upsertTemplateCategory(
                Category(
                    name = null,
                    icon = default.icon,
                    color = default.color,
                    sortOrder = default.sortOrder,
                    updatedAt = now,
                    userId = userId,
                    templateKey = default.templateKey
                )
            )
        }
        logger.info("Applied {} default categories for user: {}", defaults.size, userId)
    }
}
