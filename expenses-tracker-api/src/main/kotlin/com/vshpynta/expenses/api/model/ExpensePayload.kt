package com.vshpynta.expenses.api.model

import com.fasterxml.jackson.annotation.JsonInclude
import java.util.UUID

/**
 * Payload for expense operations in JSON format.
 *
 * `categoryId` is a stable reference to a row in `categories`. Storing the id
 * (instead of the display name) makes the reference invariant under category
 * renames and UI-language switches.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ExpensePayload(
    val id: UUID,
    val description: String? = null,
    val amount: Long? = null,  // cents
    val currency: String? = null,  // ISO 4217 currency code
    val categoryId: UUID? = null,
    val date: String? = null,  // ISO 8601
    val updatedAt: Long,
    val deleted: Boolean? = null,
    val userId: String? = null
)
