package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.controller.dto.CategoryDto
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.service.CategoryMapper.toDto
import com.vshpynta.expenses.api.service.auth.UserContextService
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.util.UUID

/**
 * Integration tests for [CategoryService] covering CRUD, restore, merge,
 * and reset-to-defaults flows. Uses Testcontainers PostgreSQL so the
 * `@Transactional` boundaries, repository upserts (last-write-wins) and
 * default-category seeding all run through real R2DBC.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class)
class CategoryServiceTest {

    companion object {
        private const val TEST_USER_ID = TestSecurityConfig.TEST_USER_ID
    }

    @Autowired
    private lateinit var categoryService: CategoryService

    @Autowired
    private lateinit var commandService: ExpenseCommandService

    @Autowired
    private lateinit var categoryRepository: CategoryRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoBean
    private lateinit var userContextService: UserContextService

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM categories WHERE user_id = '$TEST_USER_ID'")
                .fetch().rowsUpdated().awaitSingle()
            whenever(userContextService.currentUserId()) doReturn TEST_USER_ID
        }
    }

    @Test
    fun `should create a custom category with provided fields`(): Unit = runBlocking {
        // When
        val created = categoryService.createCategory(
            name = "Travel",
            icon = "Flight",
            color = "#5b8def",
            sortOrder = 5,
        )

        // Then
        assertThat(created.name).isEqualTo("Travel")
        assertThat(created.icon).isEqualTo("Flight")
        assertThat(created.color).isEqualTo("#5b8def")
        assertThat(created.sortOrder).isEqualTo(5)
        assertThat(created.deleted).isFalse()
        assertThat(created.userId).isEqualTo(TEST_USER_ID)
        assertThat(created.templateKey).isNull()

        val persisted = categoryRepository.findByIdAndUserId(created.categoryId, TEST_USER_ID)
        assertThat(persisted).isNotNull
        assertThat(persisted?.name).isEqualTo("Travel")
    }

    @Test
    fun `should return null when updating a non-existent category`(): Unit = runBlocking {
        // When
        val result = categoryService.updateCategory(
            id = UUID.randomUUID(),
            name = "Whatever",
        )

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `should update icon and color but keep name when name is null`(): Unit = runBlocking {
        // Given
        val original = categoryService.createCategory("Food", "Restaurant", "#e53935")

        // When: only icon and color are provided
        val updated = categoryService.updateCategory(
            id = original.categoryId,
            name = null,
            icon = "Coffee",
            color = "#795548",
        )

        // Then
        assertThat(updated).isNotNull
        assertThat(updated!!.name).isEqualTo("Food")
        assertThat(updated.icon).isEqualTo("Coffee")
        assertThat(updated.color).isEqualTo("#795548")
    }

    @Test
    fun `should clear name override on a templated row when blank name is provided`(): Unit = runBlocking {
        // Given: trigger seeding of templated categories
        categoryService.findAllCategoriesWithExpenseCounts().toList()
        val templated = categoryRepository.findAllByUserId(TEST_USER_ID).toList()
            .first { it.templateKey != null }
        // user override the name first
        val withOverride = categoryService.updateCategory(
            id = templated.categoryId,
            name = "My Custom Label",
        )
        assertThat(withOverride!!.name).isEqualTo("My Custom Label")

        // When: blank name on a templated row
        val cleared = categoryService.updateCategory(
            id = templated.categoryId,
            name = "  ",
        )

        // Then: name override removed, template label is restored
        assertThat(cleared).isNotNull
        assertThat(cleared!!.name).isNull()
        assertThat(cleared.templateKey).isEqualTo(templated.templateKey)
    }

    @Test
    fun `should ignore blank name on custom category`(): Unit = runBlocking {
        // Given: a custom category
        val custom = categoryService.createCategory("Books", "Book", "#2196f3")

        // When: blank name (would violate CHECK constraint if applied)
        val updated = categoryService.updateCategory(
            id = custom.categoryId,
            name = "",
            color = "#673ab7",
        )

        // Then: name preserved, color updated
        assertThat(updated).isNotNull
        assertThat(updated!!.name).isEqualTo("Books")
        assertThat(updated.color).isEqualTo("#673ab7")
    }

    @Test
    fun `should soft delete an existing category`(): Unit = runBlocking {
        // Given
        val custom = categoryService.createCategory("Old", "Category", "#9e9e9e")

        // When
        val deleted = categoryService.deleteCategory(custom.categoryId)

        // Then
        assertThat(deleted).isTrue()
        // findByIdAndUserId hides soft-deleted rows
        assertThat(categoryRepository.findByIdAndUserId(custom.categoryId, TEST_USER_ID)).isNull()
        // ...but the row still exists when including deleted
        val archived = categoryRepository.findByIdAndUserIdIncludingDeleted(custom.categoryId, TEST_USER_ID)
        assertThat(archived).isNotNull
        assertThat(archived!!.deleted).isTrue()
    }

    @Test
    fun `should return false when deleting non-existent category`(): Unit = runBlocking {
        // When
        val deleted = categoryService.deleteCategory(UUID.randomUUID())

        // Then
        assertThat(deleted).isFalse()
    }

    @Test
    fun `should restore a soft-deleted category`(): Unit = runBlocking {
        // Given: a soft-deleted category
        val custom = categoryService.createCategory("Books", "Book", "#2196f3")
        categoryService.deleteCategory(custom.categoryId)

        // When
        val restored = categoryService.restoreCategory(custom.categoryId)

        // Then
        assertThat(restored).isNotNull
        assertThat(restored!!.deleted).isFalse()
        assertThat(categoryRepository.findByIdAndUserId(custom.categoryId, TEST_USER_ID)).isNotNull
    }

    @Test
    fun `should be a no-op when restoring an already-active category`(): Unit = runBlocking {
        // Given
        val custom = categoryService.createCategory("Active", "Category", "#9e9e9e")

        // When
        val restored = categoryService.restoreCategory(custom.categoryId)

        // Then: returns the same row, no error
        assertThat(restored).isNotNull
        assertThat(restored!!.categoryId).isEqualTo(custom.categoryId)
        assertThat(restored.deleted).isFalse()
    }

    @Test
    fun `should return null when restoring non-existent category`(): Unit = runBlocking {
        // When
        val result = categoryService.restoreCategory(UUID.randomUUID())

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `should refuse to merge a category into itself`(): Unit = runBlocking {
        // Given
        val custom = categoryService.createCategory("X", "Category", "#000000")

        // When
        val result = categoryService.mergeInto(custom.categoryId, custom.categoryId)

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `should return null when merging into non-existent target`(): Unit = runBlocking {
        // Given
        val source = categoryService.createCategory("Source", "Category", "#000000")

        // When
        val result = categoryService.mergeInto(source.categoryId, UUID.randomUUID())

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `should re-categorise expenses then soft delete source on merge`(): Unit = runBlocking {
        // Given: two categories and two expenses on source
        val source = categoryService.createCategory("Source", "Category", "#111111")
        val target = categoryService.createCategory("Target", "Category", "#222222")
        val e1 = commandService.createExpense(
            description = "A", amount = 100, currency = "USD",
            categoryId = source.categoryId, date = "2026-01-01T00:00:00Z",
        )
        val e2 = commandService.createExpense(
            description = "B", amount = 200, currency = "USD",
            categoryId = source.categoryId, date = "2026-01-02T00:00:00Z",
        )

        // When
        val merged = categoryService.mergeInto(source.categoryId, target.categoryId)

        // Then: target returned, source soft-deleted, both expenses re-pointed to target
        assertThat(merged).isNotNull
        assertThat(merged!!.categoryId).isEqualTo(target.categoryId)
        assertThat(categoryRepository.findByIdAndUserId(source.categoryId, TEST_USER_ID)).isNull()
        val updatedRows = databaseClient.sql(
            "SELECT category_id FROM expense_projections WHERE id IN ('${e1.id}', '${e2.id}')"
        ).fetch().all().collectList().awaitSingle()
        assertThat(updatedRows).hasSize(2)
        updatedRows.forEach { row ->
            assertThat(row["category_id"].toString()).isEqualTo(target.categoryId.toString())
        }
    }

    @Test
    fun `should seed default categories on first access`(): Unit = runBlocking {
        // Given: brand-new user (cleanup wipes all rows)
        assertThat(categoryRepository.countByUserId(TEST_USER_ID)).isZero()

        // When
        val all = categoryService.findAllCategoriesWithExpenseCounts().toList()

        // Then: every seeded row is templated with no name override and zero expenses
        assertThat(all).isNotEmpty
        assertThat(all).allSatisfy { (cat, count) ->
            assertThat(cat.templateKey).isNotNull
            assertThat(cat.name).isNull()
            assertThat(count).isZero()
        }
    }

    @Test
    fun `should emit active expense counts in catalog`(): Unit = runBlocking {
        // Given: a category with two expenses
        val cat = categoryService.createCategory("Counted", "Category", "#333333")
        commandService.createExpense(
            description = "x", amount = 10, currency = "USD",
            categoryId = cat.categoryId, date = "2026-01-01T00:00:00Z",
        )
        commandService.createExpense(
            description = "y", amount = 20, currency = "USD",
            categoryId = cat.categoryId, date = "2026-01-02T00:00:00Z",
        )

        // When
        val all = categoryService.findAllCategoriesWithExpenseCounts().toList()

        // Then
        val (_, count) = all.single { it.first.categoryId == cat.categoryId }
        assertThat(count).isEqualTo(2L)
    }

    @Test
    fun `should expose dto fields via mapper`(): Unit = runBlocking {
        // Given
        val cat = categoryService.createCategory("Dto", "Category", "#444444", sortOrder = 7)

        // When
        val dto = cat.toDto(activeExpenseCount = 3)

        // Then
        assertThat(dto).isEqualTo(
            CategoryDto(
                id = cat.categoryId.toString(),
                name = "Dto",
                icon = "Category",
                color = "#444444",
                sortOrder = 7,
                updatedAt = cat.updatedAt,
                templateKey = null,
                deleted = false,
                activeExpenseCount = 3,
            )
        )
    }

    @Test
    fun `should soft delete custom rows and resurrect templates on reset`(): Unit = runBlocking {
        // Given: seed templates, plus a renamed template and a custom row
        categoryService.findAllCategoriesWithExpenseCounts().toList()
        val templated = categoryRepository.findAllByUserId(TEST_USER_ID).toList()
            .first { it.templateKey != null }
        categoryService.updateCategory(templated.categoryId, name = "Renamed")
        val custom = categoryService.createCategory("Custom", "Category", "#abcdef")

        // When
        categoryService.resetToDefaults()

        // Then: custom row is soft-deleted, template name override is cleared
        val customAfter = categoryRepository.findByIdAndUserIdIncludingDeleted(custom.categoryId, TEST_USER_ID)
        assertThat(customAfter?.deleted).isTrue()
        val templatedAfter = categoryRepository.findByIdAndUserId(templated.categoryId, TEST_USER_ID)
        assertThat(templatedAfter).isNotNull
        assertThat(templatedAfter!!.name).isNull()
        assertThat(templatedAfter.deleted).isFalse()
    }
}
