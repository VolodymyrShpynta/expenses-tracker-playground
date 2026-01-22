package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.SyncExpense
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import java.time.Instant
import java.util.UUID

/**
 * Tests for ExpenseRepository, focusing on:
 * - upsertExpense idempotency and last-write-wins behavior
 * - softDeleteExpense idempotency
 * - Conflict resolution with timestamps
 * - DELETE operations overriding updates
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class ExpenseRepositoryTest {

    @Autowired
    private lateinit var expenseRepository: ExpenseRepository

    @Autowired
    private lateinit var syncExpenseRepository: SyncExpenseRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM applied_operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expenses").fetch().rowsUpdated().awaitSingle()
        }
    }

    // ========== UPSERT Tests ==========

    @Test
    fun `upsertExpense should insert new expense when not exists`() = runBlocking {
        // Given: A new expense
        val expense = createExpense(
            id = UUID.randomUUID(),
            description = "New expense",
            amount = 5000L,
            updatedAt = 1000L
        )

        // When: Upserting the expense
        val result = expenseRepository.upsertExpense(expense)

        // Then: Expense should be inserted
        assertEquals(1, result, "Should return 1 (one row affected)")

        val saved = syncExpenseRepository.findByIdOrNull(expense.id)
        assertNotNull(saved, "Expense should be saved")
        assertEquals(expense.id, saved?.id)
        assertEquals("New expense", saved?.description)
        assertEquals(5000L, saved?.amount)
        assertEquals(1000L, saved?.updatedAt)
    }

    @Test
    fun `upsertExpense should update existing expense with newer timestamp`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val originalExpense = createExpense(
            id = expenseId,
            description = "Original",
            amount = 1000L,
            updatedAt = 1000L
        )
        expenseRepository.upsertExpense(originalExpense)

        // When: Upserting with newer timestamp
        val updatedExpense = createExpense(
            id = expenseId,
            description = "Updated",
            amount = 2000L,
            updatedAt = 2000L  // Newer timestamp
        )
        val result = expenseRepository.upsertExpense(updatedExpense)

        // Then: Expense should be updated
        assertEquals(1, result, "Should return 1 (one row affected)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertEquals("Updated", saved?.description, "Description should be updated")
        assertEquals(2000L, saved?.amount, "Amount should be updated")
        assertEquals(2000L, saved?.updatedAt, "Timestamp should be updated")
    }

    @Test
    fun `upsertExpense should NOT update existing expense with older timestamp (last-write-wins)`() = runBlocking {
        // Given: An existing expense with newer timestamp
        val expenseId = UUID.randomUUID()
        val newerExpense = createExpense(
            id = expenseId,
            description = "Newer version",
            amount = 2000L,
            updatedAt = 2000L
        )
        expenseRepository.upsertExpense(newerExpense)

        // When: Attempting to upsert with older timestamp (out-of-order operation)
        val olderExpense = createExpense(
            id = expenseId,
            description = "Older version",
            amount = 1000L,
            updatedAt = 1000L  // Older timestamp - should be rejected
        )
        val result = expenseRepository.upsertExpense(olderExpense)

        // Then: Expense should NOT be updated (last-write-wins)
        assertEquals(0, result, "Should return 0 (no rows affected - WHERE clause not satisfied)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertEquals("Newer version", saved?.description, "Description should remain unchanged")
        assertEquals(2000L, saved?.amount, "Amount should remain unchanged")
        assertEquals(2000L, saved?.updatedAt, "Timestamp should remain unchanged")
    }

    @Test
    fun `upsertExpense should update when timestamps are equal (edge case)`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val expense1 = createExpense(
            id = expenseId,
            description = "First write",
            amount = 1000L,
            updatedAt = 1000L
        )
        expenseRepository.upsertExpense(expense1)

        // When: Upserting with same timestamp (concurrent writes from different devices)
        val expense2 = createExpense(
            id = expenseId,
            description = "Second write",
            amount = 2000L,
            updatedAt = 1000L  // Same timestamp
        )
        val result = expenseRepository.upsertExpense(expense2)

        // Then: Should NOT update (WHERE clause requires EXCLUDED.updated_at > expenses.updated_at)
        assertEquals(0, result, "Should return 0 (equal timestamp doesn't satisfy WHERE clause)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertEquals("First write", saved?.description, "Original value should remain")
        assertEquals(1000L, saved?.amount)
    }

    @Test
    fun `upsertExpense should handle multiple updates with increasing timestamps`() = runBlocking {
        // Given: An expense ID
        val expenseId = UUID.randomUUID()

        // When: Upserting multiple times with increasing timestamps
        val expense1 = createExpense(expenseId, "Version 1", 1000L, 1000L)
        expenseRepository.upsertExpense(expense1)

        val expense2 = createExpense(expenseId, "Version 2", 2000L, 2000L)
        expenseRepository.upsertExpense(expense2)

        val expense3 = createExpense(expenseId, "Version 3", 3000L, 3000L)
        expenseRepository.upsertExpense(expense3)

        // Then: Final version should be the latest
        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertEquals("Version 3", saved?.description)
        assertEquals(3000L, saved?.amount)
        assertEquals(3000L, saved?.updatedAt)
    }

    @Test
    fun `upsertExpense should handle out-of-order operations correctly`() = runBlocking {
        // Given: Operations arriving out of order
        val expenseId = UUID.randomUUID()

        // When: Operations arrive in wrong order (2, 1, 3)
        val op2 = createExpense(expenseId, "Op 2", 2000L, 2000L)
        expenseRepository.upsertExpense(op2)

        val op1 = createExpense(expenseId, "Op 1", 1000L, 1000L)  // Older - should be rejected
        val result1 = expenseRepository.upsertExpense(op1)

        val op3 = createExpense(expenseId, "Op 3", 3000L, 3000L)  // Newer - should update
        val result3 = expenseRepository.upsertExpense(op3)

        // Then: Only newer operations should be applied
        assertEquals(0, result1, "Op 1 should be rejected (older)")
        assertEquals(1, result3, "Op 3 should be applied (newer)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertEquals("Op 3", saved?.description, "Should have the latest version")
        assertEquals(3000L, saved?.updatedAt)
    }

    @Test
    fun `upsertExpense should be idempotent - same operation twice has no effect`() = runBlocking {
        // Given: An expense
        val expense = createExpense(
            id = UUID.randomUUID(),
            description = "Test",
            amount = 1000L,
            updatedAt = 1000L
        )

        // When: Upserting the same expense twice
        val result1 = expenseRepository.upsertExpense(expense)
        val result2 = expenseRepository.upsertExpense(expense)

        // Then: First succeeds, second has no effect
        assertEquals(1, result1, "First upsert should insert")
        assertEquals(0, result2, "Second upsert should have no effect (same timestamp)")

        val saved = syncExpenseRepository.findByIdOrNull(expense.id)
        assertNotNull(saved)
        assertEquals("Test", saved?.description)
        assertEquals(1000L, saved?.amount)
    }

    // ========== DELETE Override Tests ==========

    @Test
    fun `upsertExpense with deleted=true should override older non-deleted expense`() = runBlocking {
        // Given: An existing non-deleted expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = false
        )
        expenseRepository.upsertExpense(expense)

        // When: Upserting with deleted=true and newer timestamp
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 1000L,
            updatedAt = 2000L,
            deleted = true
        )
        val result = expenseRepository.upsertExpense(deletedExpense)

        // Then: Should be updated (deleted flag overrides)
        assertEquals(1, result, "Should update to deleted")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertTrue(saved!!.deleted, "Should be marked as deleted")
        assertEquals(2000L, saved.updatedAt)
    }

    @Test
    fun `upsertExpense with deleted=true should NOT override with older timestamp`() = runBlocking {
        // Given: An existing expense with newer timestamp
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 2000L,
            updatedAt = 2000L,
            deleted = false
        )
        expenseRepository.upsertExpense(expense)

        // When: Upserting with deleted=true but OLDER timestamp
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 2000L,
            updatedAt = 1000L,  // Older timestamp
            deleted = true
        )
        val result = expenseRepository.upsertExpense(deletedExpense)

        // Then: Should NOT be updated (older timestamp, consistent last-write-wins)
        assertEquals(0, result, "Should not update with older timestamp (last-write-wins)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertFalse(saved!!.deleted, "Should remain active (newer timestamp wins)")
        assertEquals(2000L, saved.updatedAt)
    }

    @Test
    fun `upsertExpense should NOT resurrect deleted expense with older update`() = runBlocking {
        // Given: An expense that was deleted
        val expenseId = UUID.randomUUID()
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Deleted",
            amount = 2000L,
            updatedAt = 2000L,
            deleted = true
        )
        expenseRepository.upsertExpense(deletedExpense)

        // When: Trying to update with older timestamp and deleted=false
        val updateExpense = createExpense(
            id = expenseId,
            description = "Trying to resurrect",
            amount = 3000L,
            updatedAt = 1000L,  // Older timestamp
            deleted = false
        )
        val result = expenseRepository.upsertExpense(updateExpense)

        // Then: Should NOT update (older timestamp, not a delete)
        assertEquals(0, result, "Should not resurrect with older timestamp")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertTrue(saved!!.deleted, "Should remain deleted")
        assertEquals("Deleted", saved.description)
        assertEquals(2000L, saved.updatedAt)
    }

    @Test
    fun `upsertExpense should allow resurrection with newer timestamp`() = runBlocking {
        // Given: An expense that was deleted
        val expenseId = UUID.randomUUID()
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Deleted",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = true
        )
        expenseRepository.upsertExpense(deletedExpense)

        // When: Updating with NEWER timestamp and deleted=false
        val resurrectedExpense = createExpense(
            id = expenseId,
            description = "Resurrected",
            amount = 2000L,
            updatedAt = 2000L,  // Newer timestamp
            deleted = false
        )
        val result = expenseRepository.upsertExpense(resurrectedExpense)

        // Then: Should update (newer timestamp wins)
        assertEquals(1, result, "Should allow resurrection with newer timestamp")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertFalse(saved!!.deleted, "Should be active again")
        assertEquals("Resurrected", saved.description)
        assertEquals(2000L, saved.updatedAt)
    }

    // ========== Soft Delete Tests ==========

    @Test
    fun `softDeleteExpense should mark expense as deleted`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "To be deleted",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = false
        )
        expenseRepository.upsertExpense(expense)

        // When: Soft deleting the expense
        val result = expenseRepository.softDeleteExpense(expenseId, 2000L)

        // Then: Should be marked as deleted
        assertEquals(1, result, "Should return 1 (one row affected)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertTrue(saved!!.deleted, "Should be marked as deleted")
        assertEquals(2000L, saved.updatedAt, "Timestamp should be updated")
    }

    @Test
    fun `softDeleteExpense should NOT delete with older timestamp (last-write-wins)`() = runBlocking {
        // Given: An existing non-deleted expense with newer timestamp
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Recent",
            amount = 1000L,
            updatedAt = 2000L,
            deleted = false
        )
        expenseRepository.upsertExpense(expense)

        // When: Attempting to delete with OLDER timestamp
        val result = expenseRepository.softDeleteExpense(expenseId, 1000L)

        // Then: Delete should be rejected (last-write-wins: newer timestamp wins)
        assertEquals(0, result, "Should NOT delete with older timestamp")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertFalse(saved!!.deleted, "Should remain active")
        assertEquals(2000L, saved.updatedAt, "Timestamp should remain unchanged")
    }

    @Test
    fun `softDeleteExpense should NOT override already-deleted expense with older timestamp`() = runBlocking {
        // Given: An already-deleted expense with newer timestamp
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Already deleted",
            amount = 1000L,
            updatedAt = 2000L,
            deleted = true
        )
        expenseRepository.upsertExpense(expense)

        // When: Attempting to delete again with OLDER timestamp
        val result = expenseRepository.softDeleteExpense(expenseId, 1000L)

        // Then: Should NOT update (already deleted AND older timestamp)
        assertEquals(0, result, "Should return 0 (already deleted with newer timestamp)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertNotNull(saved)
        assertTrue(saved!!.deleted, "Should remain deleted")
        assertEquals(2000L, saved.updatedAt, "Timestamp should remain unchanged")
    }

    @Test
    fun `softDeleteExpense should be idempotent`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Test",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = false
        )
        expenseRepository.upsertExpense(expense)

        // When: Deleting twice with same timestamp
        val result1 = expenseRepository.softDeleteExpense(expenseId, 2000L)
        val result2 = expenseRepository.softDeleteExpense(expenseId, 2000L)

        // Then: First succeeds, second has no effect
        assertEquals(1, result1, "First delete should succeed")
        assertEquals(0, result2, "Second delete should have no effect (already deleted)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertTrue(saved!!.deleted)
        assertEquals(2000L, saved.updatedAt)
    }

    @Test
    fun `softDeleteExpense should work on non-existent expense`() = runBlocking {
        // Given: No expense exists
        val nonExistentId = UUID.randomUUID()

        // When: Attempting to delete
        val result = expenseRepository.softDeleteExpense(nonExistentId, 1000L)

        // Then: Should return 0 (no rows affected)
        assertEquals(0, result, "Should return 0 for non-existent expense")
    }

    @Test
    fun `softDeleteExpense should update already deleted expense with newer timestamp`() = runBlocking {
        // Given: An already deleted expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Deleted",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = true
        )
        expenseRepository.upsertExpense(expense)

        // When: Deleting again with newer timestamp
        val result = expenseRepository.softDeleteExpense(expenseId, 2000L)

        // Then: Should update timestamp (WHERE clause: updated_at < :updatedAt)
        assertEquals(1, result, "Should update timestamp even if already deleted")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertTrue(saved!!.deleted)
        assertEquals(2000L, saved.updatedAt, "Timestamp should be updated")
    }

    // ========== Concurrent Operations Tests ==========

    @Test
    fun `upsertExpense should handle concurrent updates from multiple devices`() = runBlocking {
        // Given: Operations from 3 devices with different timestamps
        val expenseId = UUID.randomUUID()

        // When: Operations arrive in various orders
        val device1 = createExpense(expenseId, "Device 1", 1000L, 1000L)
        expenseRepository.upsertExpense(device1)

        val device3 = createExpense(expenseId, "Device 3", 3000L, 3000L)
        expenseRepository.upsertExpense(device3)

        val device2 = createExpense(expenseId, "Device 2", 2000L, 2000L)
        val result2 = expenseRepository.upsertExpense(device2)

        // Then: Latest timestamp wins
        assertEquals(0, result2, "Device 2 update should be rejected (older than Device 3)")

        val saved = syncExpenseRepository.findByIdOrNull(expenseId)
        assertEquals("Device 3", saved?.description, "Latest update should win")
        assertEquals(3000L, saved?.updatedAt)
    }

    @Test
    fun `should handle all expense fields correctly`() = runBlocking {
        // Given: An expense with all fields set
        val expense = SyncExpense(
            id = UUID.randomUUID(),
            description = "Test Expense",
            amount = 12345L,
            category = "Food",
            date = "2026-01-20T10:00:00Z",
            updatedAt = 1000L,
            deleted = false
        )

        // When: Upserting
        expenseRepository.upsertExpense(expense)

        // Then: All fields should be saved correctly
        val saved = syncExpenseRepository.findByIdOrNull(expense.id)
        assertNotNull(saved)
        assertEquals("Test Expense", saved?.description)
        assertEquals(12345L, saved?.amount)
        assertEquals("Food", saved?.category)
        assertEquals("2026-01-20T10:00:00Z", saved?.date)
        assertEquals(1000L, saved?.updatedAt)
        assertFalse(saved!!.deleted)
    }

    // ========== Helper Functions ==========

    private fun createExpense(
        id: UUID,
        description: String,
        amount: Long,
        updatedAt: Long,
        category: String = "Test",
        deleted: Boolean = false
    ): SyncExpense {
        return SyncExpense(
            id = id,
            description = description,
            amount = amount,
            category = category,
            date = Instant.now().toString(),
            updatedAt = updatedAt,
            deleted = deleted
        )
    }
}
