package com.vshpynta.expenses.api.service

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
        category = category,
        date = date,
        updatedAt = updatedAt,
        deleted = deleted ?: false
    )

    /**
     * Converts EventEntry to ExpenseProjection using the embedded payload
     */
    fun EventEntry.toProjection() = payload.toProjection()
}
