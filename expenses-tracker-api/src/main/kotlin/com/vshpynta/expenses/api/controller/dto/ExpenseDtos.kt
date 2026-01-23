package com.vshpynta.expenses.api.controller.dto

/**
 * Request to create a new expense
 */
data class CreateExpenseRequest(
    val description: String,
    val amount: Long,  // cents
    val category: String,
    val date: String  // ISO 8601
)

/**
 * Request to update an existing expense
 */
data class UpdateExpenseRequest(
    val description: String? = null,
    val amount: Long? = null,
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
