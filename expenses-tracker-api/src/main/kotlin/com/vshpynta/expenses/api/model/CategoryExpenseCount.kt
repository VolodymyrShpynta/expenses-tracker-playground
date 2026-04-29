package com.vshpynta.expenses.api.model

import org.springframework.data.relational.core.mapping.Column
import java.util.UUID

/**
 * R2DBC projection result for the active expense count grouped by
 * category. Used by the catalog endpoint to expose
 * `activeExpenseCount` on each [com.vshpynta.expenses.api.controller.dto.CategoryDto]
 * so the frontend can hide the "merge archived twins" affordance for
 * archived rows that no longer have stranded expenses.
 */
data class CategoryExpenseCount(
    @Column("category_id")
    val categoryId: UUID,

    @Column("expense_count")
    val expenseCount: Long
)
