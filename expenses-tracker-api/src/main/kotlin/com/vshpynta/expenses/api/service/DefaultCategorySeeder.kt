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
 * Seeds default categories for new users from the default_categories template table.
 * Extracted as a separate @Component so Spring's @Transactional proxy works correctly
 * when called from CategoryService (avoids self-invocation proxy bypass).
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

    @Transactional
    suspend fun seedDefaultCategories(userId: String) {
        val now = timeProvider.currentTimeMillis()
        val defaults = defaultCategoryRepository.findAllOrderBySortOrder().toList()
        defaults.forEach { default ->
            categoryRepository.upsertCategory(
                Category(
                    name = default.name,
                    icon = default.icon,
                    color = default.color,
                    sortOrder = default.sortOrder,
                    updatedAt = now,
                    userId = userId
                )
            )
        }
        logger.info("Seeded {} default categories for user: {}", defaults.size, userId)
    }
}
