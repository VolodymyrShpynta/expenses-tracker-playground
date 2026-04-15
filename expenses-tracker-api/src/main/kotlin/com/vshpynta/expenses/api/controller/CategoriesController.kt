package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.controller.dto.CategoryDto
import com.vshpynta.expenses.api.controller.dto.CreateCategoryRequest
import com.vshpynta.expenses.api.controller.dto.UpdateCategoryRequest
import com.vshpynta.expenses.api.service.CategoryMapper.toDto
import com.vshpynta.expenses.api.service.CategoryService
import jakarta.validation.Valid
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * REST controller for user-configurable expense categories
 */
@RestController
@RequestMapping("/api/categories")
class CategoriesController(
    private val categoryService: CategoryService
) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    suspend fun createCategory(@Valid @RequestBody request: CreateCategoryRequest): CategoryDto {
        val category = categoryService.createCategory(
            name = request.name,
            icon = request.icon,
            color = request.color,
            sortOrder = request.sortOrder
        )
        return category.toDto()
    }

    @PutMapping("/{id}")
    suspend fun updateCategory(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateCategoryRequest
    ): CategoryDto {
        val category = categoryService.updateCategory(
            id = UUID.fromString(id),
            name = request.name,
            icon = request.icon,
            color = request.color,
            sortOrder = request.sortOrder
        ) ?: throw NoSuchElementException("Category not found: $id")
        return category.toDto()
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    suspend fun deleteCategory(@PathVariable id: String) {
        val deleted = categoryService.deleteCategory(UUID.fromString(id))
        if (!deleted) {
            throw NoSuchElementException("Category not found: $id")
        }
    }

    @GetMapping
    fun getAllCategories(): Flow<CategoryDto> {
        return categoryService.findAllCategories()
            .map { it.toDto() }
    }

    @GetMapping("/{id}")
    suspend fun getCategoryById(@PathVariable id: String): CategoryDto {
        val category = categoryService.findCategoryById(UUID.fromString(id))
            ?: throw NoSuchElementException("Category not found: $id")
        return category.toDto()
    }
}
