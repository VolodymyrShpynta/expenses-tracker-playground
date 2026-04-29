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
 * Category data transfer object.
 *
 * `name` is nullable: a templated row (`templateKey != null`) with no user
 * override carries `name = null`, and the frontend resolves the display
 * label via the `categoryTemplates.<templateKey>` i18n key. A non-null
 * `name` either means a user-created custom category (`templateKey == null`)
 * or a user override on a templated row.
 *
 * `deleted` is exposed so callers fetching the full catalog (with
 * `?includeArchived=true`) can distinguish active rows from soft-deleted
 * ones used solely for resolving historic expenses' display fields.
 */
data class CategoryDto(
    val id: String,
    val name: String?,
    val icon: String,
    val color: String,
    val sortOrder: Int,
    val updatedAt: Long,
    val templateKey: String?,
    val deleted: Boolean,
    /**
     * Number of active expenses currently referencing this category.
     * Surfaced so the frontend's "merge archived twins" affordance only
     * appears for archived rows that still have stranded expenses; an
     * archived row whose expenses have all been migrated has
     * `activeExpenseCount = 0` and the badge stays hidden.
     */
    val activeExpenseCount: Long = 0
)
