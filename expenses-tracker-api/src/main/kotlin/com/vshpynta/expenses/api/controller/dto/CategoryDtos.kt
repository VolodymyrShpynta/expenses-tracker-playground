package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.controller.dto.FieldLimits.CATEGORY_COLOR_PATTERN
import com.vshpynta.expenses.api.controller.dto.FieldLimits.CATEGORY_ICON_MAX
import com.vshpynta.expenses.api.controller.dto.FieldLimits.CATEGORY_NAME_MAX
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

/**
 * Request to create a new category
 */
data class CreateCategoryRequest(
    @field:NotBlank(message = "Name is required")
    @field:Size(max = CATEGORY_NAME_MAX, message = "Name must be at most {max} characters")
    val name: String,
    @field:NotBlank(message = "Icon is required")
    @field:Size(max = CATEGORY_ICON_MAX, message = "Icon must be at most {max} characters")
    val icon: String,
    @field:NotBlank(message = "Color is required")
    @field:Pattern(regexp = CATEGORY_COLOR_PATTERN, message = "Color must be a valid hex color (e.g. #ff5722)")
    val color: String,
    val sortOrder: Int = 0
)

/**
 * Request to update an existing category
 */
data class UpdateCategoryRequest(
    @field:Size(max = CATEGORY_NAME_MAX, message = "Name must be at most {max} characters")
    val name: String? = null,
    @field:Size(max = CATEGORY_ICON_MAX, message = "Icon must be at most {max} characters")
    val icon: String? = null,
    @field:Pattern(regexp = CATEGORY_COLOR_PATTERN, message = "Color must be a valid hex color (e.g. #ff5722)")
    val color: String? = null,
    val sortOrder: Int? = null
)

/**
 * Category data transfer object
 */
data class CategoryDto(
    val id: String,
    val name: String,
    val icon: String,
    val color: String,
    val sortOrder: Int,
    val updatedAt: Long
)
