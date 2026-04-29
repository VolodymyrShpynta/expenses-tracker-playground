package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ExpenseDto
import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.service.ExpenseMapper.toDto
import com.vshpynta.expenses.api.service.ExpenseMapper.toProjection
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * Pure unit tests for [ExpenseMapper] — verifies field-by-field mapping
 * including nullable fallbacks, currency default, and the `EventEntry`
 * userId fallback rule.
 */
class ExpenseMapperTest {

    @Test
    fun `should map ExpensePayload to ExpenseProjection with all fields`() {
        // Given
        val id = UUID.randomUUID()
        val categoryId = UUID.randomUUID()
        val payload = ExpensePayload(
            id = id,
            description = "Coffee",
            amount = 450,
            currency = "EUR",
            categoryId = categoryId,
            date = "2026-01-20T10:00:00Z",
            updatedAt = 1_700_000_000_000L,
            deleted = false,
            userId = "u1",
        )

        // When
        val projection = payload.toProjection()

        // Then
        assertThat(projection).isEqualTo(
            ExpenseProjection(
                id = id,
                description = "Coffee",
                amount = 450,
                currency = "EUR",
                categoryId = categoryId,
                date = "2026-01-20T10:00:00Z",
                updatedAt = 1_700_000_000_000L,
                deleted = false,
                userId = "u1",
            )
        )
    }

    @Test
    fun `should default amount currency and deleted when null on payload`() {
        // Given: minimal payload (delete-style event has only id+updatedAt+deleted+userId)
        val id = UUID.randomUUID()
        val payload = ExpensePayload(
            id = id,
            updatedAt = 1L,
            userId = "u1",
        )

        // When
        val projection = payload.toProjection()

        // Then
        assertThat(projection).isEqualTo(
            ExpenseProjection(
                id = id,
                description = null,
                amount = 0,
                currency = "USD",
                categoryId = null,
                date = null,
                updatedAt = 1L,
                deleted = false,
                userId = "u1",
            )
        )
    }

    @Test
    fun `should fail to project payload without userId`() {
        // Given
        val payload = ExpensePayload(id = UUID.randomUUID(), updatedAt = 1L, userId = null)

        // When / Then
        assertThatThrownBy { payload.toProjection() }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("userId is required")
    }

    @Test
    fun `should fall back to event-level userId when payload userId is null`() {
        // Given
        val expenseId = UUID.randomUUID()
        val entry = EventEntry(
            eventId = UUID.randomUUID().toString(),
            timestamp = 1L,
            eventType = "EXPENSE_CREATED",
            expenseId = expenseId.toString(),
            payload = ExpensePayload(id = expenseId, updatedAt = 1L, userId = null),
            userId = "fallback-user",
        )

        // When
        val projection = entry.toProjection()

        // Then
        assertThat(projection.userId).isEqualTo("fallback-user")
    }

    @Test
    fun `should prefer payload userId over event-level userId when both present`() {
        // Given
        val expenseId = UUID.randomUUID()
        val entry = EventEntry(
            eventId = UUID.randomUUID().toString(),
            timestamp = 1L,
            eventType = "EXPENSE_CREATED",
            expenseId = expenseId.toString(),
            payload = ExpensePayload(id = expenseId, updatedAt = 1L, userId = "from-payload"),
            userId = "from-event",
        )

        // When
        val projection = entry.toProjection()

        // Then
        assertThat(projection.userId).isEqualTo("from-payload")
    }

    @Test
    fun `should map ExpenseProjection to ExpenseDto with null-safe defaults`() {
        // Given: a projection with nullable fields unset
        val id = UUID.randomUUID()
        val projection = ExpenseProjection(
            id = id,
            amount = 500,
            updatedAt = 10L,
            userId = "u1",
        )

        // When
        val dto = projection.toDto()

        // Then: nullable string fields collapse to "" so the JSON wire format stays consistent
        assertThat(dto).isEqualTo(
            ExpenseDto(
                id = id.toString(),
                description = "",
                amount = 500,
                currency = "USD",
                categoryId = "",
                date = "",
                updatedAt = 10L,
                deleted = false,
            )
        )
    }
}
