package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ExpenseDto
import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.ExpenseProjection

/**
 * Shared mapping functions for expense domain objects
 *
 * Centralizes conversion logic to avoid duplication across services.
 * Used by both ExpenseCommandService (local operations) and
 * ExpenseSyncRecorder (sync operations).
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
     * Converts EventEntry to ExpenseProjection using the embedded payload
     * Falls back to the event-level userId if the payload doesn't have one
     */
    fun EventEntry.toProjection(): ExpenseProjection {
        val effectivePayload = if (payload.userId == null && userId != null) {
            payload.copy(userId = userId)
        } else {
            payload
        }
        return effectivePayload.toProjection()
    }

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
