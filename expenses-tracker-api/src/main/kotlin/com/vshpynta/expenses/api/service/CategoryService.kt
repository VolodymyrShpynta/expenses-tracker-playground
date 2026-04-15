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

    fun findAllCategories(): Flow<Category> = flow {
        val userId = userContextService.currentUserId()
        ensureCategoriesExist(userId)
        emitAll(categoryRepository.findAllActiveByUserId(userId))
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
        val updated = existing.copy(
            name = name ?: existing.name,
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

    private suspend fun ensureCategoriesExist(userId: String) {
        if (categoryRepository.countByUserId(userId) == 0L) {
            defaultCategorySeeder.seedDefaultCategories(userId)
        }
    }
}
