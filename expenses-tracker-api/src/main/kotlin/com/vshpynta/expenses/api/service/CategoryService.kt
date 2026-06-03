package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.service.gdpr.WritesUserData
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Service surface for user-configurable expense categories
 * (CRUD + restore + merge + factory-reset).
 *
 * Concrete behaviour lives in [DefaultCategoryService]; GDPR Art. 18
 * enforcement lives in the `GdprAwareCategoryService` decorator (in
 * the `service.gdpr` package), which is wired as the `@Primary` bean.
 *
 * Methods annotated with [WritesUserData] are gated by
 * `ProcessingRestrictionGuard` in the decorator. The
 * `GdprDecoratorArchTest` asserts that every such method is overridden
 * by the decorator and that the override invokes the guard.
 */
interface CategoryService {

    /**
     * Catalog augmented with the number of active expenses each
     * category has. Read-side — allowed during a restriction
     * (Art. 18(2)).
     */
    fun findAllCategoriesWithExpenseCounts(): Flow<Pair<Category, Long>>

    suspend fun findCategoryById(id: UUID): Category?

    @WritesUserData
    suspend fun createCategory(
        name: String,
        icon: String,
        color: String,
        sortOrder: Int = 0,
    ): Category

    @WritesUserData
    suspend fun updateCategory(
        id: UUID,
        name: String? = null,
        icon: String? = null,
        color: String? = null,
        sortOrder: Int? = null,
    ): Category?

    @WritesUserData
    suspend fun deleteCategory(id: UUID): Boolean

    @WritesUserData
    suspend fun restoreCategory(id: UUID): Category?

    /**
     * Merge `sourceId` into `targetId`. Wrapped in a single
     * `@Transactional` boundary on the impl side so a failure mid-loop
     * rolls back the entire merge.
     */
    @WritesUserData
    suspend fun mergeInto(sourceId: UUID, targetId: UUID): Category?

    /**
     * Factory-reset the user's category list (wipe custom + re-seed
     * defaults). Wrapped in a single `@Transactional` boundary on the
     * impl side.
     */
    @WritesUserData
    suspend fun resetToDefaults()
}
