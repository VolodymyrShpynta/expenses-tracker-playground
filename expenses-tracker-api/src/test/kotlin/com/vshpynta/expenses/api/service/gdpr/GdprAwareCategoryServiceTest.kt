package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.service.CategoryService
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.Mockito.inOrder
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.whenever
import java.util.UUID

/**
 * Unit tests for [GdprAwareCategoryService]. Verifies that every write
 * invokes [ProcessingRestrictionGuard.requireWritesAllowed] before
 * delegating, that a guard violation short-circuits before the
 * delegate runs, and that read-side methods do NOT call the guard
 * (Art. 18(2) carve-out).
 *
 * The `GdprDecoratorArchTest` is the structural safety net covering
 * "every interface write method is overridden + invokes the guard";
 * these tests cover the behavioural contract per method.
 */
@ExtendWith(MockitoExtension::class)
class GdprAwareCategoryServiceTest {

    @Mock
    private lateinit var delegate: CategoryService

    @Mock
    private lateinit var guard: ProcessingRestrictionGuard

    @Test
    fun `findAllCategoriesWithExpenseCounts should not call guard`() {
        // Given
        val expected = emptyFlow<Pair<Category, Long>>()
        whenever(delegate.findAllCategoriesWithExpenseCounts()) doReturn expected
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        val actual = decorator.findAllCategoriesWithExpenseCounts()

        // Then
        assertThat(actual).isSameAs(expected)
        runBlocking { verify(guard, never()).requireWritesAllowed() }
        verify(delegate).findAllCategoriesWithExpenseCounts()
    }

    @Test
    fun `findCategoryById should not call guard`() = runTest {
        // Given
        whenever(delegate.findCategoryById(any())) doReturn null
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        decorator.findCategoryById(UUID.randomUUID())

        // Then
        verify(guard, never()).requireWritesAllowed()
        verify(delegate).findCategoryById(any())
    }

    @Test
    fun `createCategory should call guard then delegate`() = runTest {
        // Given
        val expected = category()
        whenever(delegate.createCategory(any(), any(), any(), any())) doReturn expected
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        val result = decorator.createCategory("Food", "icon", "#fff", 0)

        // Then
        assertThat(result).isSameAs(expected)
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).createCategory(any(), any(), any(), any())
    }

    @Test
    fun `updateCategory should call guard then delegate`() = runTest {
        // Given
        val expected = category()
        whenever(
            delegate.updateCategory(any(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        ) doReturn expected
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        val result = decorator.updateCategory(UUID.randomUUID(), "new", null, null, null)

        // Then
        assertThat(result).isSameAs(expected)
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate)
            .updateCategory(any(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
    }

    @Test
    fun `deleteCategory should call guard then delegate`() = runTest {
        // Given
        whenever(delegate.deleteCategory(any())) doReturn true
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        val result = decorator.deleteCategory(UUID.randomUUID())

        // Then
        assertThat(result).isTrue()
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).deleteCategory(any())
    }

    @Test
    fun `restoreCategory should call guard then delegate`() = runTest {
        // Given
        whenever(delegate.restoreCategory(any())) doReturn category()
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        decorator.restoreCategory(UUID.randomUUID())

        // Then
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).restoreCategory(any())
    }

    @Test
    fun `mergeInto should call guard then delegate`() = runTest {
        // Given
        whenever(delegate.mergeInto(any(), any())) doReturn category()
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        decorator.mergeInto(UUID.randomUUID(), UUID.randomUUID())

        // Then
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).mergeInto(any(), any())
    }

    @Test
    fun `resetToDefaults should call guard then delegate`() = runTest {
        // Given
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When
        decorator.resetToDefaults()

        // Then
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).resetToDefaults()
    }

    @Test
    fun `write methods should not call delegate when guard throws`() {
        // Given
        runBlocking {
            doThrow(ProcessingRestrictedException("user-1", RestrictionGround.ACCURACY_CONTESTED))
                .whenever(guard).requireWritesAllowed()
        }
        val decorator = GdprAwareCategoryService(delegate, guard)

        // When / Then — sample one write per kind; the other write paths share the
        // same guard call shape and are covered structurally by GdprDecoratorArchTest.
        assertThatThrownBy {
            runBlocking { decorator.createCategory("x", "y", "z", 0) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        assertThatThrownBy {
            runBlocking { decorator.deleteCategory(UUID.randomUUID()) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        assertThatThrownBy {
            runBlocking { decorator.mergeInto(UUID.randomUUID(), UUID.randomUUID()) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        runBlocking {
            verify(delegate, never()).createCategory(any(), any(), any(), any())
            verify(delegate, never()).deleteCategory(any())
            verify(delegate, never()).mergeInto(any(), any())
        }
    }

    private fun category() = Category(
        name = "Food",
        icon = "Restaurant",
        color = "#e53935",
        sortOrder = 0,
        updatedAt = 0L,
        userId = "user-1",
    )
}
