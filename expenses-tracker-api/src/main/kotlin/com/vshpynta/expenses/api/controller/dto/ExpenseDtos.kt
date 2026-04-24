package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.controller.dto.FieldLimits.CURRENCY_CODE_LENGTH
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_DATE_MAX
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_DESCRIPTION_MAX
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import java.util.UUID

/**
 * Request to create a new expense.
 *
 * `categoryId` is the UUID of a row in `categories`. Jackson rejects malformed
 * UUID strings at decoding time (clean 400), and `@NotNull` rejects a missing
 * value at validation time. The reference survives renames and language switches
 * because the frontend resolves it to (name, icon, color) at render time.
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
    @field:NotNull(message = "Category id is required")
    val categoryId: UUID?,
    @field:NotBlank(message = "Date is required")
    @field:Size(max = EXPENSE_DATE_MAX, message = "Date must be at most {max} characters")
    val date: String  // ISO 8601
)

/**
 * Request to update an existing expense. Each field is optional (null = leave unchanged).
 * Malformed UUIDs in `categoryId` are rejected by Jackson at decoding time.
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
    val categoryId: UUID? = null,
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
    val categoryId: String,
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
