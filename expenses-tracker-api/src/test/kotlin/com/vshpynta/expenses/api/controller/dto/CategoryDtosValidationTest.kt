package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.controller.dto.FieldLimits.CATEGORY_ICON_MAX
import com.vshpynta.expenses.api.controller.dto.FieldLimits.CATEGORY_NAME_MAX
import jakarta.validation.Validation
import jakarta.validation.Validator
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance

/**
 * Bean Validation tests for [CreateCategoryRequest] and [UpdateCategoryRequest].
 *
 * Pure unit tests — no Spring context, no Docker. They exercise the `@field:Size`,
 * `@field:NotBlank`, and `@field:Pattern` annotations wired to [FieldLimits].
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CategoryDtosValidationTest {

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

    @Test
    fun `create - should pass for valid payload`() {
        // Given / When
        val violations = validator.validate(validCreate())

        // Then
        assertThat(violations).isEmpty()
    }

    @Test
    fun `create - should accept name of exactly max length`() {
        val request = validCreate(name = "x".repeat(CATEGORY_NAME_MAX))

        val violations = validator.validate(request)

        assertThat(violations).isEmpty()
    }

    @Test
    fun `create - should reject name longer than max`() {
        // Given: name exceeding the limit by one
        val request = validCreate(name = "x".repeat(CATEGORY_NAME_MAX + 1))

        // When
        val violations = validator.validate(request)

        // Then
        assertThat(violations).hasSize(1)
        val violation = violations.single()
        assertThat(violation.propertyPath.toString()).isEqualTo("name")
        assertThat(violation.message).contains(CATEGORY_NAME_MAX.toString())
    }

    @Test
    fun `create - should reject blank name`() {
        val request = validCreate(name = "  ")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch {
            it.propertyPath.toString() == "name" && it.message == "Name is required"
        }
    }

    @Test
    fun `create - should accept icon of exactly max length`() {
        val request = validCreate(icon = "x".repeat(CATEGORY_ICON_MAX))

        val violations = validator.validate(request)

        assertThat(violations).isEmpty()
    }

    @Test
    fun `create - should reject icon longer than max`() {
        val request = validCreate(icon = "x".repeat(CATEGORY_ICON_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("icon")
    }

    @Test
    fun `create - should reject blank icon`() {
        val request = validCreate(icon = "")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch {
            it.propertyPath.toString() == "icon" && it.message == "Icon is required"
        }
    }

    @Test
    fun `create - should accept valid hex colors in lower and upper case`() {
        // Given
        val lower = validCreate(color = "#abcdef")
        val upper = validCreate(color = "#ABCDEF")
        val mixed = validCreate(color = "#aB12fE")

        // When / Then
        assertThat(validator.validate(lower)).isEmpty()
        assertThat(validator.validate(upper)).isEmpty()
        assertThat(validator.validate(mixed)).isEmpty()
    }

    @Test
    fun `create - should reject hex color without hash`() {
        val request = validCreate(color = "ff5722")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch { it.propertyPath.toString() == "color" }
    }

    @Test
    fun `create - should reject 3-digit shorthand hex color`() {
        // Given: `#fff` is NOT accepted — our regex requires exactly 6 digits
        val request = validCreate(color = "#fff")

        // When
        val violations = validator.validate(request)

        // Then
        assertThat(violations).anyMatch { it.propertyPath.toString() == "color" }
    }

    @Test
    fun `create - should reject hex color with non-hex character`() {
        val request = validCreate(color = "#ggghhh")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch { it.propertyPath.toString() == "color" }
    }

    @Test
    fun `create - should reject blank color`() {
        val request = validCreate(color = "")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch {
            it.propertyPath.toString() == "color" && it.message == "Color is required"
        }
    }

    // -----------------------------------------------------------------------
    // UpdateCategoryRequest
    // -----------------------------------------------------------------------

    @Test
    fun `update - should pass for all-null payload`() {
        val violations = validator.validate(UpdateCategoryRequest())

        assertThat(violations).isEmpty()
    }

    @Test
    fun `update - should pass for valid partial payload`() {
        val request = UpdateCategoryRequest(name = "Updated", color = "#00ff00")

        val violations = validator.validate(request)

        assertThat(violations).isEmpty()
    }

    @Test
    fun `update - should reject name longer than max`() {
        val request = UpdateCategoryRequest(name = "x".repeat(CATEGORY_NAME_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("name")
    }

    @Test
    fun `update - should reject icon longer than max`() {
        val request = UpdateCategoryRequest(icon = "x".repeat(CATEGORY_ICON_MAX + 1))

        val violations = validator.validate(request)

        assertThat(violations).hasSize(1)
        assertThat(violations.single().propertyPath.toString()).isEqualTo("icon")
    }

    @Test
    fun `update - should reject invalid color pattern`() {
        val request = UpdateCategoryRequest(color = "red")

        val violations = validator.validate(request)

        assertThat(violations).anyMatch { it.propertyPath.toString() == "color" }
    }

    private fun validCreate(
        name: String = "Groceries",
        icon: String = "ShoppingCart",
        color: String = "#ff5722",
        sortOrder: Int = 0,
    ) = CreateCategoryRequest(name, icon, color, sortOrder)
}
