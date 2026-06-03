package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.service.ExpenseCommandService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Decorator that enforces Art. 18 processing restrictions on every
 * write to [ExpenseCommandService]. Registered as `@Primary`, so this
 * is the bean controllers receive when they inject the interface.
 *
 * Each method invokes [ProcessingRestrictionGuard.requireWritesAllowed]
 * before delegating; the decorator is the only place in the codebase
 * that knows about restrictions for command-side writes.
 *
 * **No `by delegate` on purpose.** Each method is forwarded
 * explicitly. The compiler then enforces "implement every interface
 * method", and the `GdprDecoratorArchTest` enforces "every override of
 * a [WritesUserData] method must call the guard". Together they
 * eliminate the silent-bypass failure mode where a new interface
 * method gets a free pass.
 *
 * **`@Transactional` here intentionally mirrors the impl.** Two
 * reasons:
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
class GdprAwareExpenseCommandService(
    @Qualifier("defaultExpenseCommandService")
    private val delegate: ExpenseCommandService,
    private val guard: ProcessingRestrictionGuard,
) : ExpenseCommandService {

    @Transactional
    override suspend fun createExpense(
        description: String,
        amount: Long,
        currency: String,
        categoryId: UUID,
        date: String,
    ): ExpenseProjection {
        guard.requireWritesAllowed()
        return delegate.createExpense(description, amount, currency, categoryId, date)
    }

    @Transactional
    override suspend fun updateExpense(
        id: UUID,
        description: String?,
        amount: Long?,
        currency: String?,
        categoryId: UUID?,
        date: String?,
    ): ExpenseProjection? {
        guard.requireWritesAllowed()
        return delegate.updateExpense(id, description, amount, currency, categoryId, date)
    }

    @Transactional
    override suspend fun deleteExpense(id: UUID): Boolean {
        guard.requireWritesAllowed()
        return delegate.deleteExpense(id)
    }
}
