package com.vshpynta.expenses.api.controller.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern

/**
 * Request to create a new category
 */
data class CreateCategoryRequest(
    @field:NotBlank(message = "Name is required")
    val name: String,
    @field:NotBlank(message = "Icon is required")
    val icon: String,
    @field:NotBlank(message = "Color is required")
    @field:Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must be a valid hex color (e.g. #ff5722)")
    val color: String,
    val sortOrder: Int = 0
)

/**
 * Request to update an existing category
 */
data class UpdateCategoryRequest(
    val name: String? = null,
    val icon: String? = null,
    @field:Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must be a valid hex color (e.g. #ff5722)")
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
