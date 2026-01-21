package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.repository.ExpenseUpsertRepository
import com.vshpynta.expenses.api.repository.OperationRepository
import com.vshpynta.expenses.api.repository.SyncExpenseRepository
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doAnswer
import org.mockito.kotlin.any
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean

/**
 * Tests for transaction atomicity in ExpenseWriteService
 * Verifies that operations and expense changes are committed or rolled back together
 *
 * Note: Cannot use @Transactional for test cleanup because R2DBC is reactive
 * and doesn't support PlatformTransactionManager. Using manual cleanup instead.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class ExpenseWriteServiceTransactionTest {

    @Autowired
    private lateinit var expenseWriteService: ExpenseWriteService

    @Autowired
    private lateinit var syncExpenseRepository: SyncExpenseRepository

    @Autowired
    private lateinit var operationRepository: OperationRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoSpyBean
    private lateinit var expenseUpsertRepository: ExpenseUpsertRepository

    @BeforeEach
    fun setup() {
        // Manual cleanup required because R2DBC doesn't support @Transactional in tests
        runBlocking {
            databaseClient.sql("DELETE FROM applied_operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expenses").fetch().rowsUpdated().awaitSingle()
        }
    }

    @Test
    fun `should create both operation and expense atomically`() = runBlocking {
        // Given: Clean database (done in @BeforeEach)

        // When: Creating an expense
        val createdExpense = createExpense("Grocery shopping", 5000, "Food")

        // Then: Both operation and expense should be created together
        val operations = getAllOperations()
        val expenses = getAllExpenses()

        assertEquals(1, operations.size, "Exactly one operation should be created")
        assertEquals(1, expenses.size, "Exactly one expense should be created")
        assertEquals(createdExpense.id, operations[0].entityId, "Operation should reference the created expense")
        assertFalse(expenses[0].deleted, "Newly created expense should not be marked as deleted")
    }

    @Test
    fun `should update both operation and expense atomically`() = runBlocking {
        // Given: An existing expense
        val originalExpense = createExpense("Original description", 1000, "Food")

        // When: Updating the expense
        val updatedExpense = expenseWriteService.updateExpense(
            id = originalExpense.id!!,
            description = "Updated description",
            amount = 2000,
            category = null,
            date = null
        )

        // Then: Both operation and expense should be updated together
        val operations = getAllOperations()
        val expenseFromDb = getExpenseById(originalExpense.id!!)

        assertEquals(2, operations.size, "Should have 2 operations (CREATE + UPDATE)")
        assertNotNull(updatedExpense, "Update should return the updated expense")
        assertEquals("Updated description", expenseFromDb?.description, "Expense description should be updated")
        assertEquals(2000L, expenseFromDb?.amount, "Expense amount should be updated")
        assertTrue(expenseFromDb!!.updatedAt > originalExpense.updatedAt, "Updated timestamp should be newer")
    }

    @Test
    fun `should soft-delete expense and create operation atomically`() = runBlocking {
        // Given: An existing expense
        val existingExpense = createExpense("Expense to delete", 500, "Test")

        // When: Deleting the expense
        val deleteResult = expenseWriteService.deleteExpense(existingExpense.id!!)

        // Then: Expense should be soft-deleted and delete operation created
        val operations = getAllOperations()
        val expenseFromDb = getExpenseById(existingExpense.id!!)

        assertTrue(deleteResult, "Delete should return true")
        assertEquals(2, operations.size, "Should have 2 operations (CREATE + DELETE)")
        assertEquals("DELETE", operations.last().operationType.name, "Last operation should be DELETE type")
        assertNotNull(expenseFromDb, "Expense should still exist in database (soft delete)")
        assertTrue(expenseFromDb!!.deleted, "Expense should be marked as deleted")
    }

    @Test
    fun `should maintain data consistency across multiple operations`() = runBlocking {
        // Given: Clean database (done in @BeforeEach)

        // When: Performing a series of operations: create 2, update 1, delete 1
        val expense1 = createExpense("Expense 1", 1000, "Food")
        val expense2 = createExpense("Expense 2", 2000, "Transport")

        expenseWriteService.updateExpense(
            id = expense1.id!!,
            description = "Expense 1 Updated",
            amount = 1500,
            category = null,
            date = null
        )

        expenseWriteService.deleteExpense(expense2.id!!)

        // Then: All operations should be recorded and expenses should reflect final state
        val operations = getAllOperations()
        val expenses = getAllExpenses()

        // Verify operation count and types
        assertEquals(4, operations.size, "Should have 4 operations total")
        val operationTypes = operations.map { it.operationType.name }.sorted()
        assertEquals(listOf("CREATE", "CREATE", "DELETE", "UPDATE"), operationTypes)

        // Verify expenses exist and have correct state
        assertEquals(2, expenses.size, "Both expenses should exist in database")

        val expense1Final = expenses.find { it.id == expense1.id }
        assertNotNull(expense1Final, "Expense 1 should exist")
        assertEquals("Expense 1 Updated", expense1Final?.description)
        assertEquals(1500L, expense1Final?.amount)
        assertFalse(expense1Final!!.deleted, "Expense 1 should not be deleted")

        val expense2Final = expenses.find { it.id == expense2.id }
        assertNotNull(expense2Final, "Expense 2 should exist")
        assertTrue(expense2Final!!.deleted, "Expense 2 should be soft-deleted")
    }

    @Test
    fun `failed transaction should not affect successful transactions`() = runBlocking {
        // Given: Two existing expenses
        val expense1 = createExpense("Expense 1", 1000, "Food")
        val expense2 = createExpense("Expense 2", 2000, "Transport")

        // When: Updating expense1 successfully, then failing to update expense2
        val successfulUpdate = expenseWriteService.updateExpense(
            id = expense1.id!!,
            description = "Successfully updated",
            amount = 1500,
            category = null,
            date = null
        )

        // Attempt to update expense2 with invalid data (should fail and rollback)
        assertThatThrownBy {
            runBlocking {
                expenseWriteService.updateExpense(
                    id = expense2.id!!,
                    description = "a".repeat(10000), // Exceeds database column limit
                    amount = 2500,
                    category = null,
                    date = null
                )
            }
        }.isInstanceOf(Exception::class.java)

        // Then: First update should be committed, second should be rolled back
        val operations = getAllOperations()
        val expense1AfterUpdate = getExpenseById(expense1.id!!)
        val expense2AfterFailedUpdate = getExpenseById(expense2.id!!)

        // Verify first transaction committed successfully
        assertNotNull(successfulUpdate, "First update should succeed")
        assertEquals(
            "Successfully updated", expense1AfterUpdate?.description,
            "First update should be persisted"
        )
        assertEquals(
            1500L, expense1AfterUpdate?.amount,
            "First update amount should be persisted"
        )

        // Verify second transaction rolled back completely
        assertEquals(
            "Expense 2", expense2AfterFailedUpdate?.description,
            "Second update should be rolled back - original description preserved"
        )
        assertEquals(
            2000L, expense2AfterFailedUpdate?.amount,
            "Second update should be rolled back - original amount preserved"
        )

        // Verify operation count: 2 creates + 1 successful update = 3
        // (failed update operation should NOT exist in database)
        assertEquals(
            3, operations.size,
            "Should have only 3 operations (failed update operation rolled back)"
        )

        val updateOperations = operations.filter { it.operationType.name == "UPDATE" }
        assertEquals(
            1, updateOperations.size,
            "Only successful update operation should exist"
        )
    }

    @Test
    fun `should rollback both operations when second operation fails`() = runBlocking {
        // Given: Clean database and spy configured to fail on second operation
        val initialOperationCount = getAllOperations().size
        val initialExpenseCount = getAllExpenses().size

        // Configure spy to simulate failure in upsertExpense (second operation)
        doAnswer {
            throw RuntimeException("Simulated failure in upsertExpense - testing rollback")
        }.`when`(expenseUpsertRepository).upsertExpense(any<SyncExpense>())

        // When: Attempting to create an expense (will fail at upsert stage)
        assertThatThrownBy {
            runBlocking {
                expenseWriteService.createExpense(
                    description = "Test expense",
                    amount = 1000,
                    category = "Food",
                    date = "2026-01-20T10:00:00Z"
                )
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated failure in upsertExpense")

        // Then: Both operations should be rolled back (nothing committed to database)
        val operationsAfter = getAllOperations()
        val expensesAfter = getAllExpenses()

        assertEquals(
            initialOperationCount, operationsAfter.size,
            "NO operations should exist - proves insertOperation was rolled back when upsertExpense failed. " +
                    "If this fails, @Transactional is not working!"
        )
        assertEquals(
            initialExpenseCount, expensesAfter.size,
            "NO expenses should exist - upsertExpense failed as expected"
        )
    }

    // ========== Helper Functions ==========

    private suspend fun createExpense(
        description: String,
        amount: Long,
        category: String
    ) = expenseWriteService.createExpense(
        description = description,
        amount = amount,
        category = category,
        date = "2026-01-20T10:00:00Z"
    )

    private suspend fun getAllOperations() = operationRepository.findAll().toList()

    private suspend fun getAllExpenses() = syncExpenseRepository.findAll().toList()

    private suspend fun getExpenseById(id: java.util.UUID) = syncExpenseRepository.findByIdOrNull(id)
}
