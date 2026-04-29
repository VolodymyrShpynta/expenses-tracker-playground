package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.CategoryDto
import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.service.CategoryMapper.toDto
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * Pure unit tests for [CategoryMapper]. Confirms the active expense
 * count default and that a templated row's null name is preserved on
 * the DTO (the frontend keys translation off `templateKey` in that case).
 */
class CategoryMapperTest {

    @Test
    fun `should map a custom category with default expense count`() {
        // Given
        val id = UUID.randomUUID()
        val category = Category(
            categoryId = id,
            name = "Travel",
            icon = "Flight",
            color = "#5b8def",
            sortOrder = 5,
            updatedAt = 1_700_000_000L,
            userId = "u1",
        )

        // When
        val dto = category.toDto()

        // Then
        assertThat(dto).isEqualTo(
            CategoryDto(
                id = id.toString(),
                name = "Travel",
                icon = "Flight",
                color = "#5b8def",
                sortOrder = 5,
                updatedAt = 1_700_000_000L,
                templateKey = null,
                deleted = false,
                activeExpenseCount = 0,
            )
        )
    }

    @Test
    fun `should preserve null name and template key on a pristine templated row`() {
        // Given
        val id = UUID.randomUUID()
        val templated = Category(
            categoryId = id,
            name = null,
            icon = "Restaurant",
            color = "#e53935",
            sortOrder = 2,
            updatedAt = 42L,
            userId = "u1",
            templateKey = "food",
        )

        // When
        val dto = templated.toDto(activeExpenseCount = 12)

        // Then
        assertThat(dto).isEqualTo(
            CategoryDto(
                id = id.toString(),
                name = null,
                icon = "Restaurant",
                color = "#e53935",
                sortOrder = 2,
                updatedAt = 42L,
                templateKey = "food",
                deleted = false,
                activeExpenseCount = 12,
            )
        )
    }

    @Test
    fun `should expose deleted flag on archived rows`() {
        // Given
        val id = UUID.randomUUID()
        val archived = Category(
            categoryId = id,
            name = "Old",
            icon = "Category",
            color = "#000000",
            sortOrder = 0,
            updatedAt = 7L,
            deleted = true,
            userId = "u1",
        )

        // When
        val dto = archived.toDto()

        // Then
        assertThat(dto).isEqualTo(
            CategoryDto(
                id = id.toString(),
                name = "Old",
                icon = "Category",
                color = "#000000",
                sortOrder = 0,
                updatedAt = 7L,
                templateKey = null,
                deleted = true,
                activeExpenseCount = 0,
            )
        )
    }
}
