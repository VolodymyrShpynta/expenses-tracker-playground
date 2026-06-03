package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.service.CategoryService
import kotlinx.coroutines.flow.Flow
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Decorator that enforces Art. 18 processing restrictions on every
 * write to [CategoryService]. Registered as `@Primary`, so this is the
 * bean controllers receive when they inject the interface.
 *
 * Each write method invokes
 * [ProcessingRestrictionGuard.requireWritesAllowed] before delegating;
 * the decorator is the only place in the codebase that knows about
 * restrictions for category writes. Read-side methods
 * ([findAllCategoriesWithExpenseCounts], [findCategoryById]) are
 * forwarded without a guard call — Art. 18(2) allows the subject's own
 * reads during a restriction.
 *
 * **No `by delegate` on purpose.** Each method is forwarded
 * explicitly. The compiler then enforces "implement every interface
 * method", and the `GdprDecoratorArchTest` enforces "every override of
 * a [WritesUserData] method must call the guard". Together they
 * eliminate the silent-bypass failure mode where a new interface
 * method gets a free pass.
 *
 * **`@Transactional` on each write intentionally mirrors the impl.**
 * Two reasons:
 *
 *  1. **Semantic equivalence with the pre-decorator boundary.** When
 *     the guard call lived inside the impl's `@Transactional` service
 *     method, the SELECT against `processing_restrictions` and the
 *     subsequent writes shared one transaction. Annotating the
 *     decorator preserves that property after the SRP split: the impl's
 *     own `@Transactional` joins via `PROPAGATION_REQUIRED` instead of
 *     opening a second one.
 *  2. **One R2DBC connection per request instead of two.** Without
 *     this annotation the guard SELECT would run in autocommit
 *     (acquire+release a pooled connection), then the impl's
 *     `@Transactional` would acquire a second one for the writes. With
 *     the annotation, guard + writes share a single pooled connection
 *     for the whole call — one fewer pool round-trip per write.
 *
 * **What this does NOT do:** it does not close the TOCTOU race against
 * a concurrent admin INSERT into `processing_restrictions`. Under
 * `READ COMMITTED`, a SELECT does not block a concurrent insert; the
 * race window between the guard check and the first write exists in
 * either mode and is accepted.
 */
@Service
@Primary
class GdprAwareCategoryService(
    @Qualifier("defaultCategoryService")
    private val delegate: CategoryService,
    private val guard: ProcessingRestrictionGuard,
) : CategoryService {

    // Read-side — no guard.
    override fun findAllCategoriesWithExpenseCounts(): Flow<Pair<Category, Long>> =
        delegate.findAllCategoriesWithExpenseCounts()

    // Read-side — no guard.
    override suspend fun findCategoryById(id: UUID): Category? =
        delegate.findCategoryById(id)

    @Transactional
    override suspend fun createCategory(
        name: String,
        icon: String,
        color: String,
        sortOrder: Int,
    ): Category {
        guard.requireWritesAllowed()
        return delegate.createCategory(name, icon, color, sortOrder)
    }

    @Transactional
    override suspend fun updateCategory(
        id: UUID,
        name: String?,
        icon: String?,
        color: String?,
        sortOrder: Int?,
    ): Category? {
        guard.requireWritesAllowed()
        return delegate.updateCategory(id, name, icon, color, sortOrder)
    }

    @Transactional
    override suspend fun deleteCategory(id: UUID): Boolean {
        guard.requireWritesAllowed()
        return delegate.deleteCategory(id)
    }

    @Transactional
    override suspend fun restoreCategory(id: UUID): Category? {
        guard.requireWritesAllowed()
        return delegate.restoreCategory(id)
    }

    @Transactional
    override suspend fun mergeInto(sourceId: UUID, targetId: UUID): Category? {
        guard.requireWritesAllowed()
        return delegate.mergeInto(sourceId, targetId)
    }

    @Transactional
    override suspend fun resetToDefaults() {
        guard.requireWritesAllowed()
        delegate.resetToDefaults()
    }
}
