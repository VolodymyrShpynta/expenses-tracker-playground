package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.controller.dto.FieldLimits.CURRENCY_CODE_LENGTH
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_CATEGORY_MAX
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_DATE_MAX
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_DESCRIPTION_MAX
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size

/**
 * Request to create a new expense
 */
data class CreateExpenseRequest(
    @field:NotBlank(message = "Description is required")
    @field:Size(max = EXPENSE_DESCRIPTION_MAX, message = "Description must be at most {max} characters")
    val description: String,
    @field:Positive(message = "Amount must be positive")
    val amount: Long,  // cents
    @field:NotBlank(message = "Currency is required")
    @field:Size(
        min = CURRENCY_CODE_LENGTH,
        max = CURRENCY_CODE_LENGTH,
        message = "Currency must be a 3-letter ISO 4217 code"
    )
    val currency: String,  // ISO 4217 currency code
    @field:NotBlank(message = "Category is required")
    @field:Size(max = EXPENSE_CATEGORY_MAX, message = "Category must be at most {max} characters")
    val category: String,
    @field:NotBlank(message = "Date is required")
    @field:Size(max = EXPENSE_DATE_MAX, message = "Date must be at most {max} characters")
    val date: String  // ISO 8601
)

/**
 * Request to update an existing expense
 */
data class UpdateExpenseRequest(
    @field:Size(max = EXPENSE_DESCRIPTION_MAX, message = "Description must be at most {max} characters")
    val description: String? = null,
    val amount: Long? = null,
    @field:Size(
        min = CURRENCY_CODE_LENGTH,
        max = CURRENCY_CODE_LENGTH,
        message = "Currency must be a 3-letter ISO 4217 code"
    )
    val currency: String? = null,
    @field:Size(max = EXPENSE_CATEGORY_MAX, message = "Category must be at most {max} characters")
    val category: String? = null,
    @field:Size(max = EXPENSE_DATE_MAX, message = "Date must be at most {max} characters")
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
