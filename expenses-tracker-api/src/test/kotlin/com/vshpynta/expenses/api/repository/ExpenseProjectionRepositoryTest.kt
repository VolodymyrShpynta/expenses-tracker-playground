package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.model.ExpenseProjection
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
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
 * Tests for ExpenseProjectionRepository, focusing on:
 * - projectFromEvent idempotency and last-write-wins behavior
 * - markAsDeleted idempotency
 * - Conflict resolution with timestamps
 * - DELETE events overriding updates
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class)
class ExpenseProjectionRepositoryTest {

    companion object {
        private const val TEST_USER_ID = "test-user-id"
    }

    @Autowired
    private lateinit var projectionRepository: ExpenseProjectionRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
        }
    }

    // ========== UPSERT Tests ==========

    @Test
    fun `projectFromEvent should insert new expense when not exists`(): Unit = runBlocking {
        // Given: A new expense
        val expense = createExpense(
            id = UUID.randomUUID(),
            description = "New expense",
            amount = 5000L,
            updatedAt = 1000L
        )

        // When: Upserting the expense
        val result = projectionRepository.projectFromEvent(expense)

        // Then: Expense should be inserted
        assertThat(result).describedAs("Should return 1 (one row affected)").isEqualTo(1)

        val saved = projectionRepository.findByIdAndUserId(expense.id, TEST_USER_ID)
        assertThat(saved).describedAs("Expense should be saved").isNotNull()
        assertThat(saved?.id).isEqualTo(expense.id)
        assertThat(saved?.description).isEqualTo("New expense")
        assertThat(saved?.amount).isEqualTo(5000L)
        assertThat(saved?.updatedAt).isEqualTo(1000L)
    }

    @Test
    fun `projectFromEvent should update existing expense with newer timestamp`(): Unit = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val originalExpense = createExpense(
            id = expenseId,
            description = "Original",
            amount = 1000L,
            updatedAt = 1000L
        )
        projectionRepository.projectFromEvent(originalExpense)

        // When: Upserting with newer timestamp
        val updatedExpense = createExpense(
            id = expenseId,
            description = "Updated",
            amount = 2000L,
            updatedAt = 2000L  // Newer timestamp
        )
        val result = projectionRepository.projectFromEvent(updatedExpense)

        // Then: Expense should be updated
        assertThat(result).describedAs("Should return 1 (one row affected)").isEqualTo(1)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved?.description).describedAs("Description should be updated").isEqualTo("Updated")
        assertThat(saved?.amount).describedAs("Amount should be updated").isEqualTo(2000L)
        assertThat(saved?.updatedAt).describedAs("Timestamp should be updated").isEqualTo(2000L)
    }

    @Test
    fun `projectFromEvent should NOT update existing expense with older timestamp (last-write-wins)`(): Unit =
        runBlocking {
            // Given: An existing expense with newer timestamp
            val expenseId = UUID.randomUUID()
            val newerExpense = createExpense(
                id = expenseId,
                description = "Newer version",
                amount = 2000L,
                updatedAt = 2000L
            )
            projectionRepository.projectFromEvent(newerExpense)

            // When: Attempting to upsert with older timestamp (out-of-order operation)
            val olderExpense = createExpense(
                id = expenseId,
                description = "Older version",
                amount = 1000L,
                updatedAt = 1000L  // Older timestamp - should be rejected
            )
            val result = projectionRepository.projectFromEvent(olderExpense)

            // Then: Expense should NOT be updated (last-write-wins)
            assertThat(result).describedAs("Should return 0 (no rows affected - WHERE clause not satisfied)")
                .isEqualTo(0)

            val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
            assertThat(saved).isNotNull()
            assertThat(saved?.description).describedAs("Description should remain unchanged").isEqualTo("Newer version")
            assertThat(saved?.amount).describedAs("Amount should remain unchanged").isEqualTo(2000L)
            assertThat(saved?.updatedAt).describedAs("Timestamp should remain unchanged").isEqualTo(2000L)
        }

    @Test
    fun `projectFromEvent should update when timestamps are equal (edge case)`(): Unit = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val expense1 = createExpense(
            id = expenseId,
            description = "First write",
            amount = 1000L,
            updatedAt = 1000L
        )
        projectionRepository.projectFromEvent(expense1)

        // When: Upserting with same timestamp (concurrent writes from different devices)
        val expense2 = createExpense(
            id = expenseId,
            description = "Second write",
            amount = 2000L,
            updatedAt = 1000L  // Same timestamp
        )
        val result = projectionRepository.projectFromEvent(expense2)

        // Then: Should NOT update (WHERE clause requires EXCLUDED.updated_at > expenses.updated_at)
        assertThat(result).describedAs("Should return 0 (equal timestamp doesn't satisfy WHERE clause)").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved?.description).describedAs("Original value should remain").isEqualTo("First write")
        assertThat(saved?.amount).isEqualTo(1000L)
    }

    @Test
    fun `projectFromEvent should handle multiple updates with increasing timestamps`(): Unit = runBlocking {
        // Given: An expense ID
        val expenseId = UUID.randomUUID()

        // When: Upserting multiple times with increasing timestamps
        val expense1 = createExpense(expenseId, "Version 1", 1000L, 1000L)
        projectionRepository.projectFromEvent(expense1)

        val expense2 = createExpense(expenseId, "Version 2", 2000L, 2000L)
        projectionRepository.projectFromEvent(expense2)

        val expense3 = createExpense(expenseId, "Version 3", 3000L, 3000L)
        projectionRepository.projectFromEvent(expense3)

        // Then: Final version should be the latest
        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved?.description).isEqualTo("Version 3")
        assertThat(saved?.amount).isEqualTo(3000L)
        assertThat(saved?.updatedAt).isEqualTo(3000L)
    }

    @Test
    fun `projectFromEvent should handle out-of-order operations correctly`(): Unit = runBlocking {
        // Given: Operations arriving out of order
        val expenseId = UUID.randomUUID()

        // When: Operations arrive in wrong order (2, 1, 3)
        val op2 = createExpense(expenseId, "Op 2", 2000L, 2000L)
        projectionRepository.projectFromEvent(op2)

        val op1 = createExpense(expenseId, "Op 1", 1000L, 1000L)  // Older - should be rejected
        val result1 = projectionRepository.projectFromEvent(op1)

        val op3 = createExpense(expenseId, "Op 3", 3000L, 3000L)  // Newer - should update
        val result3 = projectionRepository.projectFromEvent(op3)

        // Then: Only newer operations should be applied
        assertThat(result1).describedAs("Op 1 should be rejected (older)").isEqualTo(0)
        assertThat(result3).describedAs("Op 3 should be applied (newer)").isEqualTo(1)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved?.description).describedAs("Should have the latest version").isEqualTo("Op 3")
        assertThat(saved?.updatedAt).isEqualTo(3000L)
    }

    @Test
    fun `projectFromEvent should be idempotent - same operation twice has no effect`(): Unit = runBlocking {
        // Given: An expense
        val expense = createExpense(
            id = UUID.randomUUID(),
            description = "Test",
            amount = 1000L,
            updatedAt = 1000L
        )

        // When: Upserting the same expense twice
        val result1 = projectionRepository.projectFromEvent(expense)
        val result2 = projectionRepository.projectFromEvent(expense)

        // Then: First succeeds, second has no effect
        assertThat(result1).describedAs("First upsert should insert").isEqualTo(1)
        assertThat(result2).describedAs("Second upsert should have no effect (same timestamp)").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expense.id, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved?.description).isEqualTo("Test")
        assertThat(saved?.amount).isEqualTo(1000L)
    }

    // ========== DELETE Override Tests ==========

    @Test
    fun `projectFromEvent with deleted=true should override older non-deleted expense`(): Unit = runBlocking {
        // Given: An existing non-deleted expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = false
        )
        projectionRepository.projectFromEvent(expense)

        // When: Upserting with deleted=true and newer timestamp
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 1000L,
            updatedAt = 2000L,
            deleted = true
        )
        val result = projectionRepository.projectFromEvent(deletedExpense)

        // Then: Should be updated (deleted flag overrides)
        assertThat(result).describedAs("Should update to deleted").isEqualTo(1)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved!!.deleted).describedAs("Should be marked as deleted").isTrue()
        assertThat(saved.updatedAt).isEqualTo(2000L)
    }

    @Test
    fun `projectFromEvent with deleted=true should NOT override with older timestamp`(): Unit = runBlocking {
        // Given: An existing expense with newer timestamp
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 2000L,
            updatedAt = 2000L,
            deleted = false
        )
        projectionRepository.projectFromEvent(expense)

        // When: Upserting with deleted=true but OLDER timestamp
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Active",
            amount = 2000L,
            updatedAt = 1000L,  // Older timestamp
            deleted = true
        )
        val result = projectionRepository.projectFromEvent(deletedExpense)

        // Then: Should NOT be updated (older timestamp, consistent last-write-wins)
        assertThat(result).describedAs("Should not update with older timestamp (last-write-wins)").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved!!.deleted).describedAs("Should remain active (newer timestamp wins)").isFalse()
        assertThat(saved.updatedAt).isEqualTo(2000L)
    }

    @Test
    fun `projectFromEvent should NOT resurrect deleted expense with older update`(): Unit = runBlocking {
        // Given: An expense that was deleted
        val expenseId = UUID.randomUUID()
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Deleted",
            amount = 2000L,
            updatedAt = 2000L,
            deleted = true
        )
        projectionRepository.projectFromEvent(deletedExpense)

        // When: Trying to update with older timestamp and deleted=false
        val updateExpense = createExpense(
            id = expenseId,
            description = "Trying to resurrect",
            amount = 3000L,
            updatedAt = 1000L,  // Older timestamp
            deleted = false
        )
        val result = projectionRepository.projectFromEvent(updateExpense)

        // Then: Should NOT update (older timestamp, not a delete)
        assertThat(result).describedAs("Should not resurrect with older timestamp").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved!!.deleted).describedAs("Should remain deleted").isTrue()
        assertThat(saved.description).isEqualTo("Deleted")
        assertThat(saved.updatedAt).isEqualTo(2000L)
    }

    @Test
    fun `projectFromEvent should allow resurrection with newer timestamp`(): Unit = runBlocking {
        // Given: An expense that was deleted
        val expenseId = UUID.randomUUID()
        val deletedExpense = createExpense(
            id = expenseId,
            description = "Deleted",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = true
        )
        projectionRepository.projectFromEvent(deletedExpense)

        // When: Updating with NEWER timestamp and deleted=false
        val resurrectedExpense = createExpense(
            id = expenseId,
            description = "Resurrected",
            amount = 2000L,
            updatedAt = 2000L,  // Newer timestamp
            deleted = false
        )
        val result = projectionRepository.projectFromEvent(resurrectedExpense)

        // Then: Should update (newer timestamp wins)
        assertThat(result).describedAs("Should allow resurrection with newer timestamp").isEqualTo(1)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved!!.deleted).describedAs("Should be active again").isFalse()
        assertThat(saved.description).isEqualTo("Resurrected")
        assertThat(saved.updatedAt).isEqualTo(2000L)
    }

    // ========== Soft Delete Tests ==========

    @Test
    fun `markAsDeleted should mark expense as deleted`(): Unit = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "To be deleted",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = false
        )
        projectionRepository.projectFromEvent(expense)

        // When: Soft deleting the expense
        val result = projectionRepository.markAsDeleted(expenseId, 2000L)

        // Then: Should be marked as deleted
        assertThat(result).describedAs("Should return 1 (one row affected)").isEqualTo(1)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved!!.deleted).describedAs("Should be marked as deleted").isTrue()
        assertThat(saved.updatedAt).describedAs("Timestamp should be updated").isEqualTo(2000L)
    }

    @Test
    fun `markAsDeleted should NOT delete with older timestamp (last-write-wins)`(): Unit = runBlocking {
        // Given: An existing non-deleted expense with newer timestamp
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Recent",
            amount = 1000L,
            updatedAt = 2000L,
            deleted = false
        )
        projectionRepository.projectFromEvent(expense)

        // When: Attempting to delete with OLDER timestamp
        val result = projectionRepository.markAsDeleted(expenseId, 1000L)

        // Then: Delete should be rejected (last-write-wins: newer timestamp wins)
        assertThat(result).describedAs("Should NOT delete with older timestamp").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved!!.deleted).describedAs("Should remain active").isFalse()
        assertThat(saved.updatedAt).describedAs("Timestamp should remain unchanged").isEqualTo(2000L)
    }

    @Test
    fun `markAsDeleted should NOT override already-deleted expense with older timestamp`(): Unit = runBlocking {
        // Given: An already-deleted expense with newer timestamp
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Already deleted",
            amount = 1000L,
            updatedAt = 2000L,
            deleted = true
        )
        projectionRepository.projectFromEvent(expense)

        // When: Attempting to delete again with OLDER timestamp
        val result = projectionRepository.markAsDeleted(expenseId, 1000L)

        // Then: Should NOT update (already deleted AND older timestamp)
        assertThat(result).describedAs("Should return 0 (already deleted with newer timestamp)").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved!!.deleted).describedAs("Should remain deleted").isTrue()
        assertThat(saved.updatedAt).describedAs("Timestamp should remain unchanged").isEqualTo(2000L)
    }

    @Test
    fun `markAsDeleted should be idempotent`(): Unit = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Test",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = false
        )
        projectionRepository.projectFromEvent(expense)

        // When: Deleting twice with same timestamp
        val result1 = projectionRepository.markAsDeleted(expenseId, 2000L)
        val result2 = projectionRepository.markAsDeleted(expenseId, 2000L)

        // Then: First succeeds, second has no effect
        assertThat(result1).describedAs("First delete should succeed").isEqualTo(1)
        assertThat(result2).describedAs("Second delete should have no effect (already deleted)").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved!!.deleted).isTrue()
        assertThat(saved.updatedAt).isEqualTo(2000L)
    }

    @Test
    fun `markAsDeleted should work on non-existent expense`(): Unit = runBlocking {
        // Given: No expense exists
        val nonExistentId = UUID.randomUUID()

        // When: Attempting to delete
        val result = projectionRepository.markAsDeleted(nonExistentId, 1000L)

        // Then: Should return 0 (no rows affected)
        assertThat(result).describedAs("Should return 0 for non-existent expense").isEqualTo(0)
    }

    @Test
    fun `markAsDeleted should update already deleted expense with newer timestamp`(): Unit = runBlocking {
        // Given: An already deleted expense
        val expenseId = UUID.randomUUID()
        val expense = createExpense(
            id = expenseId,
            description = "Deleted",
            amount = 1000L,
            updatedAt = 1000L,
            deleted = true
        )
        projectionRepository.projectFromEvent(expense)

        // When: Deleting again with newer timestamp
        val result = projectionRepository.markAsDeleted(expenseId, 2000L)

        // Then: Should update timestamp (WHERE clause: updated_at < :updatedAt)
        assertThat(result).describedAs("Should update timestamp even if already deleted").isEqualTo(1)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved!!.deleted).isTrue()
        assertThat(saved.updatedAt).describedAs("Timestamp should be updated").isEqualTo(2000L)
    }

    // ========== Concurrent Operations Tests ==========

    @Test
    fun `projectFromEvent should handle concurrent updates from multiple devices`(): Unit = runBlocking {
        // Given: Operations from 3 devices with different timestamps
        val expenseId = UUID.randomUUID()

        // When: Operations arrive in various orders
        val device1 = createExpense(expenseId, "Device 1", 1000L, 1000L)
        projectionRepository.projectFromEvent(device1)

        val device3 = createExpense(expenseId, "Device 3", 3000L, 3000L)
        projectionRepository.projectFromEvent(device3)

        val device2 = createExpense(expenseId, "Device 2", 2000L, 2000L)
        val result2 = projectionRepository.projectFromEvent(device2)

        // Then: Latest timestamp wins
        assertThat(result2).describedAs("Device 2 update should be rejected (older than Device 3)").isEqualTo(0)

        val saved = projectionRepository.findByIdAndUserId(expenseId, TEST_USER_ID)
        assertThat(saved?.description).describedAs("Latest update should win").isEqualTo("Device 3")
        assertThat(saved?.updatedAt).isEqualTo(3000L)
    }

    @Test
    fun `should handle all expense fields correctly`(): Unit = runBlocking {
        // Given: An expense with all fields set
        val expense = ExpenseProjection(
            id = UUID.randomUUID(),
            description = "Test Expense",
            amount = 12345L,
            category = "Food",
            date = "2026-01-20T10:00:00Z",
            updatedAt = 1000L,
            deleted = false,
            userId = TEST_USER_ID
        )

        // When: Upserting
        projectionRepository.projectFromEvent(expense)

        // Then: All fields should be saved correctly
        val saved = projectionRepository.findByIdAndUserId(expense.id, TEST_USER_ID)
        assertThat(saved).isNotNull()
        assertThat(saved?.description).isEqualTo("Test Expense")
        assertThat(saved?.amount).isEqualTo(12345L)
        assertThat(saved?.category).isEqualTo("Food")
        assertThat(saved?.date).isEqualTo("2026-01-20T10:00:00Z")
        assertThat(saved?.updatedAt).isEqualTo(1000L)
        assertThat(saved!!.deleted).isFalse()
    }

    // ========== Helper Functions ==========

    private fun createExpense(
        id: UUID,
        description: String,
        amount: Long,
        updatedAt: Long,
        category: String = "Test",
        deleted: Boolean = false
    ): ExpenseProjection {
        return ExpenseProjection(
            id = id,
            description = description,
            amount = amount,
            category = category,
            date = Instant.now().toString(),
            updatedAt = updatedAt,
            deleted = deleted,
            userId = TEST_USER_ID
        )
    }
}
