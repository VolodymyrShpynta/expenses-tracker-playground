package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
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
 * Tests for transaction atomicity in ExpenseCommandService
 * Verifies that expense events and expense projections are committed or rolled back together
 *
 * Note: Cannot use @Transactional for test cleanup because R2DBC is reactive
 * and doesn't support PlatformTransactionManager. Using manual cleanup instead.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class ExpenseCommandServiceTransactionTest {

    @Autowired
    private lateinit var commandService: ExpenseCommandService

    @Autowired
    private lateinit var eventRepository: ExpenseEventRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoSpyBean
    private lateinit var projectionRepository: ExpenseProjectionRepository

    @BeforeEach
    fun setup() {
        // Manual cleanup required because R2DBC doesn't support @Transactional in tests
        runBlocking {
            databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
        }
    }

    @Test
    fun `should create both operation and expense atomically`() = runBlocking {
        // Given: Clean database (done in @BeforeEach)

        // When: Creating an expense
        val createdExpense = createExpense("Grocery shopping", 5000, "Food")

        // Then: Both event and projection should be created together
        val events = getAllEvents()
        val projections = getAllProjections()

        assertEquals(1, events.size, "Exactly one event should be created")
        assertEquals(1, projections.size, "Exactly one projection should be created")
        assertEquals(createdExpense.id, events[0].expenseId, "Event should reference the created expense")
        assertFalse(projections[0].deleted, "Newly created projection should not be marked as deleted")
    }

    @Test
    fun `should update both operation and expense atomically`() = runBlocking {
        // Given: An existing expense
        val originalExpense = createExpense("Original description", 1000, "Food")

        // When: Updating the expense
        val updatedExpense = commandService.updateExpense(
            id = originalExpense.id,
            description = "Updated description",
            amount = 2000,
            category = null,
            date = null
        )

        // Then: Both event and projection should be updated together
        val events = getAllEvents()
        val projectionFromDb = getProjectionById(originalExpense.id)

        assertEquals(2, events.size, "Should have 2 events (CREATED + UPDATED)")
        assertNotNull(updatedExpense, "Update should return the updated expense")
        assertEquals("Updated description", projectionFromDb?.description, "Projection description should be updated")
        assertEquals(2000L, projectionFromDb?.amount, "Projection amount should be updated")
        assertTrue(projectionFromDb!!.updatedAt > originalExpense.updatedAt, "Updated timestamp should be newer")
    }

    @Test
    fun `should soft-delete expense projection and create event atomically`() = runBlocking {
        // Given: An existing expense
        val existingExpense = createExpense("Expense to delete", 500, "Test")

        // When: Deleting the expense
        val deleteResult = commandService.deleteExpense(existingExpense.id)

        // Then: Projection should be soft-deleted and delete event created
        val events = getAllEvents()
        val projectionFromDb = getProjectionById(existingExpense.id)

        assertTrue(deleteResult, "Delete should return true")
        assertEquals(2, events.size, "Should have 2 events (CREATED + DELETED)")
        assertEquals("DELETED", events.last().eventType.name, "Last event should be DELETED type")
        assertNotNull(projectionFromDb, "Projection should still exist in database (soft delete)")
        assertTrue(projectionFromDb!!.deleted, "Projection should be marked as deleted")
    }

    @Test
    fun `should maintain data consistency across multiple events`() = runBlocking {
        // Given: Clean database (done in @BeforeEach)

        // When: Performing a series of operations: create 2, update 1, delete 1
        val expense1 = createExpense("Expense 1", 1000, "Food")
        val expense2 = createExpense("Expense 2", 2000, "Transport")

        commandService.updateExpense(
            id = expense1.id,
            description = "Expense 1 Updated",
            amount = 1500,
            category = null,
            date = null
        )

        commandService.deleteExpense(expense2.id)

        // Then: All events should be recorded and projections should reflect final state
        val events = getAllEvents()
        val projections = getAllProjections()

        // Verify event count and types
        assertEquals(4, events.size, "Should have 4 events total")
        val eventTypes = events.map { it.eventType.name }.sorted()
        assertEquals(listOf("CREATED", "CREATED", "DELETED", "UPDATED"), eventTypes)

        // Verify projections exist and have correct state
        assertEquals(2, projections.size, "Both projections should exist in database")

        val projection1Final = projections.find { it.id == expense1.id }
        assertNotNull(projection1Final, "Projection 1 should exist")
        assertEquals("Expense 1 Updated", projection1Final?.description)
        assertEquals(1500L, projection1Final?.amount)
        assertFalse(projection1Final!!.deleted, "Projection 1 should not be deleted")

        val projection2Final = projections.find { it.id == expense2.id }
        assertNotNull(projection2Final, "Projection 2 should exist")
        assertTrue(projection2Final!!.deleted, "Projection 2 should be soft-deleted")
    }

    @Test
    fun `failed transaction should not affect successful transactions`() = runBlocking {
        // Given: Two existing expenses
        val expense1 = createExpense("Expense 1", 1000, "Food")
        val expense2 = createExpense("Expense 2", 2000, "Transport")

        // When: Updating expense1 successfully, then failing to update expense2
        val successfulUpdate = commandService.updateExpense(
            id = expense1.id,
            description = "Successfully updated",
            amount = 1500,
            category = null,
            date = null
        )

        // Attempt to update expense2 with invalid data (should fail and rollback)
        assertThatThrownBy {
            runBlocking {
                commandService.updateExpense(
                    id = expense2.id,
                    description = "a".repeat(10000), // Exceeds database column limit
                    amount = 2500,
                    category = null,
                    date = null
                )
            }
        }.isInstanceOf(Exception::class.java)

        // Then: First update should be committed, second should be rolled back
        val events = getAllEvents()
        val projection1AfterUpdate = getProjectionById(expense1.id)
        val projection2AfterFailedUpdate = getProjectionById(expense2.id)

        // Verify first transaction committed successfully
        assertNotNull(successfulUpdate, "First update should succeed")
        assertEquals(
            "Successfully updated", projection1AfterUpdate?.description,
            "First update should be persisted"
        )
        assertEquals(
            1500L, projection1AfterUpdate?.amount,
            "First update amount should be persisted"
        )

        // Verify second transaction rolled back completely
        assertEquals(
            "Expense 2", projection2AfterFailedUpdate?.description,
            "Second update should be rolled back - original description preserved"
        )
        assertEquals(
            2000L, projection2AfterFailedUpdate?.amount,
            "Second update should be rolled back - original amount preserved"
        )

        // Verify event count: 2 creates + 1 successful update = 3
        // (failed update event should NOT exist in database)
        assertEquals(
            3, events.size,
            "Should have only 3 events (failed update event rolled back)"
        )

        val updateEvents = events.filter { it.eventType.name == "UPDATED" }
        assertEquals(
            1, updateEvents.size,
            "Only successful update event should exist"
        )
    }

    @Test
    fun `should rollback both event and projection when projection fails`() = runBlocking {
        // Given: Clean database and spy configured to fail on projection
        val initialEventCount = getAllEvents().size
        val initialProjectionCount = getAllProjections().size

        // Configure spy to simulate failure in projectFromEvent (second operation)
        doAnswer {
            throw RuntimeException("Simulated failure in projectFromEvent - testing rollback")
        }.`when`(projectionRepository).projectFromEvent(any<ExpenseProjection>())

        // When: Attempting to create an expense (will fail at projection stage)
        assertThatThrownBy {
            runBlocking {
                commandService.createExpense(
                    description = "Test expense",
                    amount = 1000,
                    category = "Food",
                    date = "2026-01-20T10:00:00Z"
                )
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated failure in projectFromEvent")

        // Then: Both event and projection should be rolled back (nothing committed to database)
        val eventsAfter = getAllEvents()
        val projectionsAfter = getAllProjections()

        assertEquals(
            initialEventCount, eventsAfter.size,
            "NO events should exist - proves appendEvent was rolled back when projectFromEvent failed. " +
                    "If this fails, @Transactional is not working!"
        )
        assertEquals(
            initialProjectionCount, projectionsAfter.size,
            "NO projections should exist - projectFromEvent failed as expected"
        )
    }

    // ========== Helper Functions ==========

    private suspend fun createExpense(
        description: String,
        amount: Long,
        category: String
    ) = commandService.createExpense(
        description = description,
        amount = amount,
        category = category,
        date = "2026-01-20T10:00:00Z"
    )

    private suspend fun getAllEvents() = eventRepository.findAll().toList()

    private suspend fun getAllProjections() = projectionRepository.findAll().toList()

    private suspend fun getProjectionById(id: java.util.UUID) = projectionRepository.findByIdOrNull(id)
}
