package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
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
    fun `should create both operation and expense atomically`(): Unit = runBlocking {
        // Given: Clean database (done in @BeforeEach)

        // When: Creating an expense
        val createdExpense = createExpense("Grocery shopping", 5000, "Food")

        // Then: Both event and projection should be created together
        val events = getAllEvents()
        val projections = getAllProjections()

        assertThat(events).describedAs("Exactly one event should be created").hasSize(1)
        assertThat(projections).describedAs("Exactly one projection should be created").hasSize(1)
        assertThat(events[0].expenseId).describedAs("Event should reference the created expense")
            .isEqualTo(createdExpense.id)
        assertThat(projections[0].deleted).describedAs("Newly created projection should not be marked as deleted")
            .isFalse()
    }

    @Test
    fun `should update both operation and expense atomically`(): Unit = runBlocking {
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

        assertThat(events).describedAs("Should have 2 events (CREATED + UPDATED)").hasSize(2)
        assertThat(updatedExpense).describedAs("Update should return the updated expense").isNotNull()
        assertThat(projectionFromDb?.description).describedAs("Projection description should be updated")
            .isEqualTo("Updated description")
        assertThat(projectionFromDb?.amount).describedAs("Projection amount should be updated").isEqualTo(2000L)
        assertThat(projectionFromDb!!.updatedAt).describedAs("Updated timestamp should be newer")
            .isGreaterThan(originalExpense.updatedAt)
    }

    @Test
    fun `should soft-delete expense projection and create event atomically`(): Unit = runBlocking {
        // Given: An existing expense
        val existingExpense = createExpense("Expense to delete", 500, "Test")

        // When: Deleting the expense
        val deleteResult = commandService.deleteExpense(existingExpense.id)

        // Then: Projection should be soft-deleted and delete event created
        val events = getAllEvents()
        val projectionFromDb = getProjectionById(existingExpense.id)

        assertThat(deleteResult).describedAs("Delete should return true").isTrue()
        assertThat(events).describedAs("Should have 2 events (CREATED + DELETED)").hasSize(2)
        assertThat(events.last().eventType.name).describedAs("Last event should be DELETED type").isEqualTo("DELETED")
        assertThat(projectionFromDb).describedAs("Projection should still exist in database (soft delete)").isNotNull()
        assertThat(projectionFromDb!!.deleted).describedAs("Projection should be marked as deleted").isTrue()
    }

    @Test
    fun `should maintain data consistency across multiple events`(): Unit = runBlocking {
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
        assertThat(events).describedAs("Should have 4 events total").hasSize(4)
        val eventTypes = events.map { it.eventType.name }.sorted()
        assertThat(eventTypes).isEqualTo(listOf("CREATED", "CREATED", "DELETED", "UPDATED"))

        // Verify projections exist and have correct state
        assertThat(projections).describedAs("Both projections should exist in database").hasSize(2)

        val projection1Final = projections.find { it.id == expense1.id }
        assertThat(projection1Final).describedAs("Projection 1 should exist").isNotNull()
        assertThat(projection1Final?.description).isEqualTo("Expense 1 Updated")
        assertThat(projection1Final?.amount).isEqualTo(1500L)
        assertThat(projection1Final!!.deleted).describedAs("Projection 1 should not be deleted").isFalse()

        val projection2Final = projections.find { it.id == expense2.id }
        assertThat(projection2Final).describedAs("Projection 2 should exist").isNotNull()
        assertThat(projection2Final!!.deleted).describedAs("Projection 2 should be soft-deleted").isTrue()
    }

    @Test
    fun `failed transaction should not affect successful transactions`(): Unit = runBlocking {
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
        assertThat(successfulUpdate).describedAs("First update should succeed").isNotNull()
        assertThat(projection1AfterUpdate?.description)
            .describedAs("First update should be persisted")
            .isEqualTo("Successfully updated")
        assertThat(projection1AfterUpdate?.amount)
            .describedAs("First update amount should be persisted")
            .isEqualTo(1500L)

        // Verify second transaction rolled back completely
        assertThat(projection2AfterFailedUpdate?.description)
            .describedAs("Second update should be rolled back - original description preserved")
            .isEqualTo("Expense 2")
        assertThat(projection2AfterFailedUpdate?.amount)
            .describedAs("Second update should be rolled back - original amount preserved")
            .isEqualTo(2000L)

        // Verify event count: 2 creates + 1 successful update = 3
        // (failed update event should NOT exist in database)
        assertThat(events)
            .describedAs("Should have only 3 events (failed update event rolled back)")
            .hasSize(3)

        val updateEvents = events.filter { it.eventType.name == "UPDATED" }
        assertThat(updateEvents)
            .describedAs("Only successful update event should exist")
            .hasSize(1)
    }

    @Test
    fun `should rollback both event and projection when projection fails`(): Unit = runBlocking {
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

        assertThat(eventsAfter)
            .describedAs(
                "NO events should exist - proves appendEvent was rolled back when projectFromEvent failed. " +
                        "If this fails, @Transactional is not working!"
            )
            .hasSize(initialEventCount)
        assertThat(projectionsAfter)
            .describedAs("NO projections should exist - projectFromEvent failed as expected")
            .hasSize(initialProjectionCount)
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
