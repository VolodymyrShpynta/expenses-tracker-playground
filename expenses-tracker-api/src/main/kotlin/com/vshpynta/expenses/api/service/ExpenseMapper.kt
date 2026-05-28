package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ExpenseDto
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.ExpenseProjection

/**
 * Shared mapping functions for expense domain objects.
 *
 * Centralizes conversion logic to avoid duplication across services.
 */
object ExpenseMapper {

    /**
     * Converts ExpensePayload to ExpenseProjection for the read model
     */
    fun ExpensePayload.toProjection() = ExpenseProjection(
        id = id,
        description = description,
        amount = amount ?: 0L,
        currency = currency ?: "USD",
        categoryId = categoryId,
        date = date,
        updatedAt = updatedAt,
        deleted = deleted ?: false,
        userId = userId ?: error("userId is required for projection")
    )

    /**
     * Converts ExpenseProjection to ExpenseDto for the presentation layer
     */
    fun ExpenseProjection.toDto() = ExpenseDto(
        id = id.toString(),
        description = description ?: "",
        amount = amount,
        currency = currency,
        categoryId = categoryId?.toString() ?: "",
        date = date ?: "",
        updatedAt = updatedAt,
        deleted = deleted
    )
}
