package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.CategoryDto
import com.vshpynta.expenses.api.model.Category

/**
 * Shared mapping functions for category domain objects
 */
object CategoryMapper {

    fun Category.toDto() = CategoryDto(
        id = categoryId.toString(),
        name = name,
        icon = icon,
        color = color,
        sortOrder = sortOrder,
        updatedAt = updatedAt
    )
}
