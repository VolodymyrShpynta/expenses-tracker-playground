package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.OpEntry
import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.repository.AppliedOperationRepository
import com.vshpynta.expenses.api.repository.ExpenseRepository
import com.vshpynta.expenses.api.repository.OperationRepository
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.mockito.Mockito.doAnswer
import org.mockito.kotlin.any
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import java.time.Instant
import java.util.UUID

/**
 * Tests for transaction atomicity in SyncOperationExecutor
 * Verifies that all database operations in executeIfNotApplied are atomic:
 * - Check if applied
 * - Upsert/delete expense
 * - Mark as applied
 * - Mark as committed
 *
 * All steps must succeed or fail together.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class SyncOperationExecutorTransactionTest {

    @Autowired
    private lateinit var syncOperationExecutor: SyncOperationExecutor

    @MockitoSpyBean
    private lateinit var operationRepository: OperationRepository

    @MockitoSpyBean
    private lateinit var appliedOperationRepository: AppliedOperationRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoSpyBean
    private lateinit var expenseRepository: ExpenseRepository

    @Value("\${sync.device.id:device-test}")
    private lateinit var deviceId: String

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM applied_operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expenses").fetch().rowsUpdated().awaitSingle()
        }
    }

    @Test
    fun `should execute all steps atomically - success case`() = runBlocking {
        // Given: A valid operation entry
        val opEntry = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = UUID.randomUUID(),
            opType = "CREATE",
            amount = 5000
        )

        // When: Executing the operation
        val result = syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)

        // Then: All steps should be completed
        assertTrue(result, "Operation should be executed successfully")

        // Verify expense was created
        val expense = expenseRepository.findByIdOrNull(opEntry.payload.id)
        assertNotNull(expense, "Expense should be created")
        assertEquals(5000L, expense?.amount, "Expense amount should match")

        // Verify operation was marked as applied
        val wasApplied = appliedOperationRepository.hasBeenApplied(UUID.fromString(opEntry.opId))
        assertTrue(wasApplied, "Operation should be marked as applied")
    }

    @Test
    fun `should rollback all steps when expense upsert fails`() = runBlocking {
        // Given: A valid operation and spy configured to fail on upsert
        val opEntry = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = UUID.randomUUID(),
            opType = "CREATE",
            amount = 5000
        )

        val initialExpenseCount = expenseRepository.findAll().toList().size
        val initialAppliedOpsCount = getAllAppliedOperations().size

        // Configure spy to fail when upserting expense
        doAnswer {
            throw RuntimeException("Simulated upsert failure - testing rollback")
        }.`when`(expenseRepository).upsertExpense(any<SyncExpense>())

        // When: Attempting to execute operation (should fail at upsert)
        assertThatThrownBy {
            runBlocking {
                syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated upsert failure")

        // Then: Nothing should be committed (entire transaction rolled back)
        val expensesAfter = expenseRepository.findAll().toList()
        val appliedOpsAfter = getAllAppliedOperations()

        assertEquals(
            initialExpenseCount, expensesAfter.size,
            "NO expenses should be created - upsert failed as expected"
        )
        assertEquals(
            initialAppliedOpsCount, appliedOpsAfter.size,
            "NO applied operations should be recorded - proves atomicity! " +
                    "If this fails, the transaction is not atomic!"
        )

        // Double-check: Operation should NOT be marked as applied
        val wasApplied = appliedOperationRepository.hasBeenApplied(UUID.fromString(opEntry.opId))
        assertFalse(wasApplied, "Operation should NOT be marked as applied when transaction rolls back")
    }

    @Test
    fun `should rollback all steps when marking as applied fails`() = runBlocking {
        // Given: A valid operation and spy configured to fail when marking as applied
        val opEntry = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = UUID.randomUUID(),
            opType = "CREATE",
            amount = 5000
        )

        val initialExpenseCount = expenseRepository.findAll().toList().size

        // Configure spy to fail when marking as applied
        doAnswer {
            throw RuntimeException("Simulated markAsApplied failure - testing rollback")
        }.`when`(appliedOperationRepository).markAsApplied(any())

        // When: Attempting to execute operation (should fail at markAsApplied)
        assertThatThrownBy {
            runBlocking {
                syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated markAsApplied failure")

        // Then: Entire transaction should be rolled back
        val expensesAfter = expenseRepository.findAll().toList()

        assertEquals(
            initialExpenseCount, expensesAfter.size,
            "NO expenses should be created - proves upsert was rolled back when markAsApplied failed! " +
                    "If this fails, @Transactional is not working!"
        )

        // Verify expense was NOT created (rollback worked)
        val expense = expenseRepository.findByIdOrNull(opEntry.payload.id)
        assertNull(expense, "Expense should NOT exist - entire transaction rolled back")
    }

    @Test
    fun `should rollback all steps when marking as committed fails`() = runBlocking {
        // Given: A valid operation from our device, spy configured to fail on markAsCommitted
        val opEntry = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = UUID.randomUUID(),
            deviceId = deviceId,  // Same as current device
            opType = "CREATE",
            amount = 5000
        )

        val initialExpenseCount = expenseRepository.findAll().toList().size
        val initialAppliedOpsCount = getAllAppliedOperations().size

        // Configure spy to fail when marking as committed
        doAnswer {
            throw RuntimeException("Simulated markAsCommitted failure - testing rollback")
        }.`when`(operationRepository).markOperationsAsCommitted(any(), any())

        // When: Attempting to execute operation (should fail at markAsCommitted)
        assertThatThrownBy {
            runBlocking {
                syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated markAsCommitted failure")

        // Then: Entire transaction should be rolled back
        val expensesAfter = expenseRepository.findAll().toList()
        val appliedOpsAfter = getAllAppliedOperations()

        assertEquals(
            initialExpenseCount, expensesAfter.size,
            "NO expenses should be created - proves atomicity across all steps!"
        )
        assertEquals(
            initialAppliedOpsCount, appliedOpsAfter.size,
            "NO applied operations should be recorded - proves atomicity!"
        )

        // Verify nothing was persisted
        val expense = expenseRepository.findByIdOrNull(opEntry.payload.id)
        assertNull(expense, "Expense should NOT exist - entire transaction rolled back")

        val wasApplied = appliedOperationRepository.hasBeenApplied(UUID.fromString(opEntry.opId))
        assertFalse(wasApplied, "Operation should NOT be marked as applied")
    }

    @Test
    fun `should skip already applied operations without modifying data`() = runBlocking {
        // Given: An operation that was already applied
        val opEntry = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = UUID.randomUUID(),
            opType = "CREATE",
            amount = 5000
        )

        // First execution - should succeed
        val firstResult = syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)
        assertTrue(firstResult, "First execution should succeed")

        val expenseAfterFirst = expenseRepository.findByIdOrNull(opEntry.payload.id)
        assertNotNull(expenseAfterFirst, "Expense should exist after first execution")
        val firstUpdatedAt = expenseAfterFirst!!.updatedAt

        // When: Executing the same operation again (idempotency check)
        val secondResult = syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)

        // Then: Should be skipped, no modifications
        assertFalse(secondResult, "Second execution should return false (already applied)")

        val expenseAfterSecond = expenseRepository.findByIdOrNull(opEntry.payload.id)
        assertNotNull(expenseAfterSecond, "Expense should still exist")
        assertEquals(
            firstUpdatedAt, expenseAfterSecond!!.updatedAt,
            "Expense should NOT be modified on second execution (idempotency)"
        )
    }

    @Test
    fun `should handle DELETE operation atomically`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val createOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = expenseId,
            opType = "CREATE",
            amount = 5000
        )
        syncOperationExecutor.executeIfNotApplied(createOp, deviceId)

        // When: Deleting the expense
        val deleteOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = expenseId,
            opType = "DELETE",
            amount = 5000,
            deleted = true
        )
        val deleteResult = syncOperationExecutor.executeIfNotApplied(deleteOp, deviceId)

        // Then: All steps should complete atomically
        assertTrue(deleteResult, "Delete operation should succeed")

        val expense = expenseRepository.findByIdOrNull(expenseId)
        assertNotNull(expense, "Expense should still exist (soft delete)")
        assertTrue(expense!!.deleted, "Expense should be marked as deleted")

        val wasApplied = appliedOperationRepository.hasBeenApplied(UUID.fromString(deleteOp.opId))
        assertTrue(wasApplied, "Delete operation should be marked as applied")
    }

    @Test
    fun `should handle UPDATE operation atomically`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val createOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = expenseId,
            opType = "CREATE",
            amount = 1000,
            description = "Original"
        )
        syncOperationExecutor.executeIfNotApplied(createOp, deviceId)

        // When: Updating the expense
        val updateOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = expenseId,
            opType = "UPDATE",
            amount = 2000,
            description = "Updated"
        )
        val updateResult = syncOperationExecutor.executeIfNotApplied(updateOp, deviceId)

        // Then: All steps should complete atomically
        assertTrue(updateResult, "Update operation should succeed")

        val expense = expenseRepository.findByIdOrNull(expenseId)
        assertNotNull(expense, "Expense should exist")
        assertEquals(2000L, expense!!.amount, "Amount should be updated")
        assertEquals("Updated", expense.description, "Description should be updated")

        val wasApplied = appliedOperationRepository.hasBeenApplied(UUID.fromString(updateOp.opId))
        assertTrue(wasApplied, "Update operation should be marked as applied")
    }

    @Test
    fun `failed operations should not affect subsequent successful operations`() = runBlocking {
        // Given: Two operations, first will fail, second will succeed
        val op1 = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = UUID.randomUUID(),
            opType = "CREATE",
            amount = 1000
        )

        val op2 = createTestOpEntry(
            opId = UUID.randomUUID(),
            entityId = UUID.randomUUID(),
            opType = "CREATE",
            amount = 2000
        )

        // Configure spy to fail only for first operation
        doAnswer {
            throw RuntimeException("First operation fails")
        }.`when`(expenseRepository).upsertExpense(any<SyncExpense>())

        // When: Executing first operation (fails)
        assertThatThrownBy {
            runBlocking {
                syncOperationExecutor.executeIfNotApplied(op1, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("First operation fails")

        // Reset the spy to allow real method calls for the second operation
        Mockito.reset(expenseRepository)

        // Then: Executing second operation (succeeds with real implementation)
        val result2 = syncOperationExecutor.executeIfNotApplied(op2, deviceId)
        assertTrue(result2, "Second operation should succeed")

        // Verify: First operation rolled back, second committed
        val expense1 = expenseRepository.findByIdOrNull(op1.payload.id)
        assertNull(expense1, "First expense should NOT exist (transaction rolled back)")

        val expense2 = expenseRepository.findByIdOrNull(op2.payload.id)
        assertNotNull(expense2, "Second expense should exist (transaction committed)")
        assertEquals(2000L, expense2?.amount)

        // Verify applied operations
        val wasApplied1 = appliedOperationRepository.hasBeenApplied(UUID.fromString(op1.opId))
        assertFalse(wasApplied1, "First operation should NOT be marked as applied")

        val wasApplied2 = appliedOperationRepository.hasBeenApplied(UUID.fromString(op2.opId))
        assertTrue(wasApplied2, "Second operation should be marked as applied")
    }

    // ========== Helper Functions ==========

    private fun createTestOpEntry(
        opId: UUID,
        entityId: UUID,
        opType: String,
        amount: Long,
        description: String = "Test expense",
        category: String = "Test",
        deviceId: String = "device-test",
        deleted: Boolean = false
    ): OpEntry {
        val now = System.currentTimeMillis()
        return OpEntry(
            opId = opId.toString(),
            ts = now,
            deviceId = deviceId,
            opType = opType,
            entityId = entityId.toString(),
            payload = ExpensePayload(
                id = entityId,
                description = description,
                amount = amount,
                category = category,
                date = Instant.now().toString(),
                updatedAt = now,
                deleted = deleted
            )
        )
    }

    private suspend fun getAllAppliedOperations() =
        databaseClient.sql("SELECT op_id FROM applied_operations")
            .fetch()
            .all()
            .collectList()
            .awaitSingle()
}
