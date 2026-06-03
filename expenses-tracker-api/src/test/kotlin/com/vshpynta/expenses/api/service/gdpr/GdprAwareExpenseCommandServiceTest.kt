package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.service.ExpenseCommandService
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
 * Unit tests for [GdprAwareExpenseCommandService]. Verifies that every
 * write invokes [ProcessingRestrictionGuard.requireWritesAllowed]
 * before delegating, and that a guard violation short-circuits before
 * the delegate runs (so a restricted user never reaches the business
 * impl).
 *
 * Plain unit tests with mocks — no Spring context. The
 * `GdprDecoratorArchTest` is the structural safety net that covers
 * "every interface write method is overridden + invokes the guard";
 * these tests cover the behavioural contract per method.
 */
@ExtendWith(MockitoExtension::class)
class GdprAwareExpenseCommandServiceTest {

    @Mock
    private lateinit var delegate: ExpenseCommandService

    @Mock
    private lateinit var guard: ProcessingRestrictionGuard

    @Test
    fun `createExpense should call guard then delegate`() = runTest {
        // Given
        val expected = expenseProjection()
        whenever(delegate.createExpense(any(), any(), any(), any(), any())) doReturn expected
        val decorator = GdprAwareExpenseCommandService(delegate, guard)

        // When
        val result = decorator.createExpense("desc", 1_00, "USD", UUID.randomUUID(), "2026-06-01")

        // Then
        assertThat(result).isSameAs(expected)
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).createExpense(any(), any(), any(), any(), any())
    }

    @Test
    fun `createExpense should not call delegate when guard throws`() {
        // Given
        runBlocking {
            doThrow(ProcessingRestrictedException("user-1", RestrictionGround.ACCURACY_CONTESTED))
                .whenever(guard).requireWritesAllowed()
        }
        val decorator = GdprAwareExpenseCommandService(delegate, guard)

        // When / Then
        assertThatThrownBy {
            runBlocking {
                decorator.createExpense("desc", 1_00, "USD", UUID.randomUUID(), "2026-06-01")
            }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        runBlocking {
            verify(delegate, never()).createExpense(any(), any(), any(), any(), any())
        }
    }

    @Test
    fun `updateExpense should call guard then delegate`() = runTest {
        // Given
        val expected = expenseProjection()
        whenever(
            delegate.updateExpense(any(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        ) doReturn expected
        val decorator = GdprAwareExpenseCommandService(delegate, guard)

        // When
        val result = decorator.updateExpense(UUID.randomUUID(), "new", null, null, null, null)

        // Then
        assertThat(result).isSameAs(expected)
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate)
            .updateExpense(any(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
    }

    @Test
    fun `updateExpense should not call delegate when guard throws`() {
        // Given
        runBlocking {
            doThrow(ProcessingRestrictedException("user-1", RestrictionGround.OBJECTION_PENDING))
                .whenever(guard).requireWritesAllowed()
        }
        val decorator = GdprAwareExpenseCommandService(delegate, guard)

        // When / Then
        assertThatThrownBy {
            runBlocking { decorator.updateExpense(UUID.randomUUID(), null, null, null, null, null) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        runBlocking {
            verify(delegate, never())
                .updateExpense(any(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        }
    }

    @Test
    fun `deleteExpense should call guard then delegate`() = runTest {
        // Given
        whenever(delegate.deleteExpense(any())) doReturn true
        val decorator = GdprAwareExpenseCommandService(delegate, guard)

        // When
        val result = decorator.deleteExpense(UUID.randomUUID())

        // Then
        assertThat(result).isTrue()
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).deleteExpense(any())
    }

    @Test
    fun `deleteExpense should not call delegate when guard throws`() {
        // Given
        runBlocking {
            doThrow(ProcessingRestrictedException("user-1", RestrictionGround.UNLAWFUL_NOT_ERASED))
                .whenever(guard).requireWritesAllowed()
        }
        val decorator = GdprAwareExpenseCommandService(delegate, guard)

        // When / Then
        assertThatThrownBy {
            runBlocking { decorator.deleteExpense(UUID.randomUUID()) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        runBlocking { verify(delegate, never()).deleteExpense(any()) }
    }

    private fun expenseProjection() = ExpenseProjection(
        id = UUID.randomUUID(),
        description = "desc",
        amount = 1_00,
        currency = "USD",
        categoryId = UUID.randomUUID(),
        date = "2026-06-01",
        updatedAt = 0L,
        deleted = false,
        userId = "user-1",
    )
}
