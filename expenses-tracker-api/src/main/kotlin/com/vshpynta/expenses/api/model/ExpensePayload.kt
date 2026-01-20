package com.vshpynta.expenses.api.model

import com.fasterxml.jackson.annotation.JsonInclude
import java.util.UUID

/**
 * Payload for expense operations in JSON format
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ExpensePayload(
    val id: UUID,
    val description: String? = null,
    val amount: Long? = null,  // cents
    val category: String? = null,
    val date: String? = null,  // ISO 8601
    val updatedAt: Long,
    val deleted: Boolean? = null
)
