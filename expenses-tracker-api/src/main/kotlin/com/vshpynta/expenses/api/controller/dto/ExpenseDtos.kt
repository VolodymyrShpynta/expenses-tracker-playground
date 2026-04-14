package com.vshpynta.expenses.api.controller.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive

/**
 * Request to create a new expense
 */
data class CreateExpenseRequest(
    @field:NotBlank(message = "Description is required")
    val description: String,
    @field:Positive(message = "Amount must be positive")
    val amount: Long,  // cents
    @field:NotBlank(message = "Currency is required")
    val currency: String,  // ISO 4217 currency code
    @field:NotBlank(message = "Category is required")
    val category: String,
    @field:NotBlank(message = "Date is required")
    val date: String  // ISO 8601
)

/**
 * Request to update an existing expense
 */
data class UpdateExpenseRequest(
    val description: String? = null,
    val amount: Long? = null,
    val currency: String? = null,
    val category: String? = null,
    val date: String? = null
)

/**
 * Expense data transfer object
 */
data class ExpenseDto(
    val id: String,
    val description: String,
    val amount: Long,
    val currency: String,
    val category: String,
    val date: String,
    val updatedAt: Long,
    val deleted: Boolean
)

/**
 * Sync result response
 */
data class SyncResultDto(
    val message: String
)
