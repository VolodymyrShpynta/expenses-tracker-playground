package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.controller.dto.FieldLimits.CURRENCY_CODE_LENGTH
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_CATEGORY_MAX
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_DATE_MAX
import com.vshpynta.expenses.api.controller.dto.FieldLimits.EXPENSE_DESCRIPTION_MAX
import jakarta.validation.Validation
import jakarta.validation.Validator
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance

/**
 * Bean Validation tests for [CreateExpenseRequest] and [UpdateExpenseRequest].
 *
 * Pure unit tests — no Spring context, no Docker. They exercise the `@field:Size`,
 * `@field:NotBlank`, and `@field:Positive` annotations wired to [FieldLimits].
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ExpenseDtosValidationTest {

    private lateinit var validator: Validator
    private lateinit var factory: jakarta.validation.ValidatorFactory

    @BeforeAll
    fun setup() {
        factory = Validation.buildDefaultValidatorFactory()
        validator = factory.validator
    }

    @AfterAll
    fun tearDown() {
        factory.close()
    }

    // -----------------------------------------------------------------------
    // CreateExpenseRequest
    // -----------------------------------------------------------------------

    @Test
    fun `create - should pass for valid payload`() {
        // Given / When
        val violations = validator.validate(validCreate())

        // Then
        assertThat(violations).isEmpty()
    }

    @Test
    fun `create - should accept description of exactly max length`() {
        // Given: description at the boundary
        val request = validCreate(description = "x".repeat(EXPENSE_DESCRIPTION_MAX))

        // When
        val violations = validator.validate(request)

        // Then
        assertThat(violations).isEmpty()
    }

    @Test
    fun `create - should reject description longer than max`() {
        // Given: description exceeding the limit by one
        val request = validCreate(description = "x".repeat(EXPENSE_DESCRIPTION_MAX + 1))

        // When
        val violations = validator.validate(request)

        // Then
        assertThat(violations).hasSize(1)
        val violation = violations.single()
        assertThat(violation.propertyPath.toString()).isEqualTo("description")
        assertThat(violation.message).contains(EXPENSE_DESCRIPTION_MAX.toString())
    }

    @Test
    fun `create - should reject blank description`() {
        // Given
        val request = validCreate(description = "   ")

        // When
        val violations = validator.validate(request)

        // Then
        assertThat(violations).anyMatch {
            it.propertyPath.toString() == "description" && it.message == "Description is required"
        }
    }

    @Test
    fun `create - should reject non-positive amount`() {
        // Given
        val zero = validCreate(amount = 0)
        val negative = validCreate(amount = -1)

        // When / Then
        assertThat(validator.validate(zero)).anyMatch { it.propertyPath.toString() == "amount" }
        assertThat(validator.validate(negative)).anyMatch { it.propertyPath.toString() == "amount" }
    }

    @Test
    fun `create - should reject currency with wrong length`() {
        // Given: 2- and 4-letter codes
        val tooShort = validCreate(currency = "US")
        val tooLong = validCreate(currency = "USDS")

        // When / Then
        assertThat(validator.validate(tooShort)).anyMatch { it.propertyPath.toString() == "currency" }
        assertThat(validator.validate(tooLong)).anyMatch { it.propertyPath.toString() == "currency" }
    }

    @Test
    fun `create - should reject blank currency`() {
        // Given
        val request = validCreate(currency = "")

        // When
        val violations = validator.validate(request)

        // Then: @NotBlank fires (Size also fires, but NotBlank is the primary failure)
        assertThat(violations).anyMatch {
            it.propertyPath.toString() == "currency" && it.message == "Currency is required"
        }
    }

    @Test
    fun `create - should accept category of exactly max length`() {
        val request = validCreate(category = "x".repeat(EXPENSE_CATEGORY_MAX))
        assertThat(validator.validate(request)).isEmpty()
    }

    @Test
    fun `create - should reject category longer than max`() {
        val request = validCreate(category = "x".repeat(EXPENSE_CATEGORY_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("category")
    }

    @Test
    fun `create - should reject blank category`() {
        val request = validCreate(category = "")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch {
            it.propertyPath.toString() == "category" && it.message == "Category is required"
        }
    }

    @Test
    fun `create - should reject date longer than max`() {
        val request = validCreate(date = "x".repeat(EXPENSE_DATE_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("date")
    }

    @Test
    fun `create - should reject blank date`() {
        val request = validCreate(date = "")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch {
            it.propertyPath.toString() == "date" && it.message == "Date is required"
        }
    }

    // -----------------------------------------------------------------------
    // UpdateExpenseRequest
    // -----------------------------------------------------------------------

    @Test
    fun `update - should pass for all-null payload`() {
        // Given: every field is optional
        val violations = validator.validate(UpdateExpenseRequest())

        // Then
        assertThat(violations).isEmpty()
    }

    @Test
    fun `update - should pass for valid partial payload`() {
        val request = UpdateExpenseRequest(description = "Updated", amount = 999)

        val violations = validator.validate(request)

        assertThat(violations).isEmpty()
    }

    @Test
    fun `update - should reject description longer than max`() {
        val request = UpdateExpenseRequest(description = "x".repeat(EXPENSE_DESCRIPTION_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("description")
    }

    @Test
    fun `update - should reject currency with wrong length`() {
        val request = UpdateExpenseRequest(currency = "EURO")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch { it.propertyPath.toString() == "currency" }
    }

    @Test
    fun `update - should reject blank currency via Size min`() {
        // Given: empty string fails @Size(min = 3) since no @NotBlank on update
        val request = UpdateExpenseRequest(currency = "")

        // When
        val violations = validator.validate(request)

        // Then
        assertThat(violations).anyMatch { it.propertyPath.toString() == "currency" }
    }

    @Test
    fun `update - should reject category longer than max`() {
        val request = UpdateExpenseRequest(category = "x".repeat(EXPENSE_CATEGORY_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("category")
    }

    @Test
    fun `update - should reject date longer than max`() {
        val request = UpdateExpenseRequest(date = "x".repeat(EXPENSE_DATE_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("date")
    }

    @Test
    fun `update - currency length check uses CURRENCY_CODE_LENGTH constant`() {
        // Sanity: makes the test intent explicit; if the constant changes, this fails first.
        val atLength = "x".repeat(CURRENCY_CODE_LENGTH)
        val request = UpdateExpenseRequest(currency = atLength)

        val violations = validator.validate(request)

        assertThat(violations).isEmpty()
    }

    private fun validCreate(
        description: String = "Coffee",
        amount: Long = 450,
        currency: String = "USD",
        category: String = "Food",
        date: String = "2026-01-20T10:00:00Z",
    ) = CreateExpenseRequest(description, amount, currency, category, date)
}
