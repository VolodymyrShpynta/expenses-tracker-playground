package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.service.gdpr.WritesUserData
import java.util.UUID

/**
 * Command-side surface for expense write operations (CQRS write side).
 *
 * Each method appends an event to `expense_events` and projects to
 * `expense_projections` inside a single `@Transactional` boundary. The
 * concrete behaviour lives in [DefaultExpenseCommandService]; GDPR
 * Art. 18 enforcement lives in the `GdprAwareExpenseCommandService`
 * decorator (in the `service.gdpr` package), which is wired as the
 * `@Primary` bean and therefore the one controllers receive when they
 * inject [ExpenseCommandService].
 *
 * Methods annotated with [WritesUserData] are gated by
 * `ProcessingRestrictionGuard` in the decorator. The
 * `GdprDecoratorArchTest` asserts that every such method is overridden
 * by the decorator and that the override invokes the guard, so adding
 * a new write here without guarding it would fail the build.
 */
interface ExpenseCommandService {

    @WritesUserData
    suspend fun createExpense(
        description: String,
        amount: Long,
        currency: String,
        categoryId: UUID,
        date: String,
    ): ExpenseProjection

    @WritesUserData
    suspend fun updateExpense(
        id: UUID,
        description: String?,
        amount: Long?,
        currency: String?,
        categoryId: UUID?,
        date: String?,
    ): ExpenseProjection?

    @WritesUserData
    suspend fun deleteExpense(id: UUID): Boolean
}
