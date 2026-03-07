package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.repository.ProcessedEventRepository
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.mockito.Mockito.doAnswer
import org.mockito.kotlin.any
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import java.util.UUID

/**
 * Tests for transaction atomicity in ExpenseSyncProjector
 * Verifies that all database operations in projectEvent are atomic:
 * - Check if processed
 * - Project expense changes to materialized view
 * - Mark as processed
 * - Mark as committed
 *
 * All steps must succeed or fail together.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class ExpenseSyncProjectorTransactionTest {

    @Autowired
    private lateinit var expenseSyncProjector: ExpenseSyncProjector

    @MockitoSpyBean
    private lateinit var eventRepository: ExpenseEventRepository

    @MockitoSpyBean
    private lateinit var processedEventRepository: ProcessedEventRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoSpyBean
    private lateinit var projectionRepository: ExpenseProjectionRepository

    @Autowired
    private lateinit var processedEventsCache: ProcessedEventsCache

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
        }

        // Reset cache to clear state from previous tests
        processedEventsCache.reset()

        // Reset timestamp counter for deterministic tests
        timestampCounter = DEFAULT_TIMESTAMP
    }

    @Test
    fun `should execute all steps atomically - success case`(): Unit = runTest {
        // Given: A valid event entry
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 5000
        )

        // When: Projecting the event
        val result = expenseSyncProjector.projectEvent(eventEntry)

        // Then: All steps should be completed
        assertThat(result).describedAs("Event should be projected successfully").isTrue()

        // Verify expense projection was created
        val projection = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertThat(projection).describedAs("Expense projection should be created").isNotNull()
        assertThat(projection?.amount).describedAs("Expense amount should match").isEqualTo(5000L)

        // Verify event was marked as processed
        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(eventEntry.eventId))
        assertThat(wasProcessed).describedAs("Event should be marked as processed").isTrue()
    }

    @Test
    fun `should rollback all steps when expense projection fails`(): Unit = runTest {
        // Given: A valid event and spy configured to fail on projection
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 5000
        )

        val initialProjectionCount = projectionRepository.findAll().toList().size
        val initialProcessedEventsCount = getAllProcessedEvents().size

        // Configure spy to fail when projecting event
        doAnswer {
            throw RuntimeException("Simulated projection failure - testing rollback")
        }.`when`(projectionRepository).projectFromEvent(any<ExpenseProjection>())

        // When: Attempting to project event (should fail at projection)
        assertThatThrownBy {
            runBlocking {
                expenseSyncProjector.projectEvent(eventEntry)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated projection failure")

        // Then: Nothing should be committed (entire transaction rolled back)
        val projectionsAfter = projectionRepository.findAll().toList()
        val processedEventsAfter = getAllProcessedEvents()

        assertThat(projectionsAfter)
            .describedAs("NO projections should be created - projection failed as expected")
            .hasSize(initialProjectionCount)
        assertThat(processedEventsAfter)
            .describedAs(
                "NO processed events should be recorded - proves atomicity! " +
                        "If this fails, the transaction is not atomic!"
            )
            .hasSize(initialProcessedEventsCount)

        // Double-check: Event should NOT be marked as processed
        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(eventEntry.eventId))
        assertThat(wasProcessed).describedAs("Event should NOT be marked as processed when transaction rolls back")
            .isFalse()
    }

    @Test
    fun `should rollback all steps when marking as processed fails`(): Unit = runTest {
        // Given: A valid event and spy configured to fail when marking as processed
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 5000
        )

        val initialProjectionCount = projectionRepository.findAll().toList().size

        // Configure spy to fail when marking as processed
        doAnswer {
            throw RuntimeException("Simulated markAsProcessed failure - testing rollback")
        }.`when`(processedEventRepository).markAsProcessed(any())

        // When: Attempting to project event (should fail at markAsProcessed)
        assertThatThrownBy {
            runBlocking {
                expenseSyncProjector.projectEvent(eventEntry)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated markAsProcessed failure")

        // Then: Entire transaction should be rolled back
        val projectionsAfter = projectionRepository.findAll().toList()

        assertThat(projectionsAfter)
            .describedAs(
                "NO projections should be created - proves projection was rolled back when markAsProcessed failed! " +
                        "If this fails, @Transactional is not working!"
            )
            .hasSize(initialProjectionCount)

        // Verify projection was NOT created (rollback worked)
        val projection = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertThat(projection).describedAs("Projection should NOT exist - entire transaction rolled back").isNull()
    }

    @Test
    fun `should rollback all steps when marking as committed fails`(): Unit = runTest {
        // Given: A valid event from our device, spy configured to fail on markAsCommitted
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 5000
        )

        val initialProjectionCount = projectionRepository.findAll().toList().size
        val initialProcessedEventsCount = getAllProcessedEvents().size

        // Configure spy to fail when marking as committed
        doAnswer {
            throw RuntimeException("Simulated markAsCommitted failure - testing rollback")
        }.`when`(eventRepository).markEventsAsCommitted(any())

        // When: Attempting to project event (should fail at markAsCommitted)
        assertThatThrownBy {
            runBlocking {
                expenseSyncProjector.projectEvent(eventEntry)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated markAsCommitted failure")

        // Then: Entire transaction should be rolled back
        val projectionsAfter = projectionRepository.findAll().toList()
        val processedEventsAfter = getAllProcessedEvents()

        assertThat(projectionsAfter)
            .describedAs("NO projections should be created - proves atomicity across all steps!")
            .hasSize(initialProjectionCount)
        assertThat(processedEventsAfter)
            .describedAs("NO processed events should be recorded - proves atomicity!")
            .hasSize(initialProcessedEventsCount)

        // Verify nothing was persisted
        val projection = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertThat(projection).describedAs("Projection should NOT exist - entire transaction rolled back").isNull()

        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(eventEntry.eventId))
        assertThat(wasProcessed).describedAs("Event should NOT be marked as processed").isFalse()
    }

    @Test
    fun `should skip already processed events without modifying data`(): Unit = runTest {
        // Given: An event that was already processed
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 5000
        )

        // First execution - should succeed
        val firstResult = expenseSyncProjector.projectEvent(eventEntry)
        assertThat(firstResult).describedAs("First execution should succeed").isTrue()

        val projectionAfterFirst = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertThat(projectionAfterFirst).describedAs("Projection should exist after first execution").isNotNull()
        val firstUpdatedAt = projectionAfterFirst!!.updatedAt

        // When: Projecting the same event again (idempotency check)
        val secondResult = expenseSyncProjector.projectEvent(eventEntry)

        // Then: Should be skipped, no modifications
        assertThat(secondResult).describedAs("Second execution should return false (already processed)").isFalse()

        val projectionAfterSecond = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertThat(projectionAfterSecond).describedAs("Projection should still exist").isNotNull()
        assertThat(projectionAfterSecond!!.updatedAt)
            .describedAs("Projection should NOT be modified on second execution (idempotency)")
            .isEqualTo(firstUpdatedAt)
    }

    @Test
    fun `should handle DELETED event atomically`(): Unit = runTest {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val createEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 5000
        )
        expenseSyncProjector.projectEvent(createEvent)

        // When: Deleting the expense
        val deleteEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "DELETED",
            amount = 5000,
            deleted = true
        )
        val deleteResult = expenseSyncProjector.projectEvent(deleteEvent)

        // Then: All steps should complete atomically
        assertThat(deleteResult).describedAs("Delete event should be projected successfully").isTrue()

        val projection = projectionRepository.findByIdOrNull(expenseId)
        assertThat(projection).describedAs("Projection should still exist (soft delete)").isNotNull()
        assertThat(projection!!.deleted).describedAs("Projection should be marked as deleted").isTrue()

        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(deleteEvent.eventId))
        assertThat(wasProcessed).describedAs("Delete event should be marked as processed").isTrue()
    }

    @Test
    fun `should handle UPDATED event atomically`(): Unit = runTest {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val createEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 1000,
            description = "Original"
        )
        expenseSyncProjector.projectEvent(createEvent)

        // When: Updating the expense
        val updateEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "UPDATED",
            amount = 2000,
            description = "Updated"
        )
        val updateResult = expenseSyncProjector.projectEvent(updateEvent)

        // Then: All steps should complete atomically
        assertThat(updateResult).describedAs("Update event should be projected successfully").isTrue()

        val projection = projectionRepository.findByIdOrNull(expenseId)
        assertThat(projection).describedAs("Projection should exist").isNotNull()
        assertThat(projection!!.amount).describedAs("Amount should be updated").isEqualTo(2000L)
        assertThat(projection.description).describedAs("Description should be updated").isEqualTo("Updated")

        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(updateEvent.eventId))
        assertThat(wasProcessed).describedAs("Update event should be marked as processed").isTrue()
    }

    @Test
    fun `failed events should not affect subsequent successful events`(): Unit = runTest {
        // Given: Two events, first will fail, second will succeed
        val event1 = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 1000
        )

        val event2 = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 2000
        )

        // Configure spy to fail only for first event
        doAnswer {
            throw RuntimeException("First event projection fails")
        }.`when`(projectionRepository).projectFromEvent(any<ExpenseProjection>())

        // When: Executing first event (fails)
        assertThatThrownBy {
            runBlocking {
                expenseSyncProjector.projectEvent(event1)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("First event projection fails")

        // Reset the spy to allow real method calls for the second event
        Mockito.reset(projectionRepository)

        // Then: Executing second event (succeeds with real implementation)
        val result2 = expenseSyncProjector.projectEvent(event2)
        assertThat(result2).describedAs("Second event should be projected successfully").isTrue()

        // Verify: First event rolled back, second committed
        val projection1 = projectionRepository.findByIdOrNull(event1.payload.id)
        assertThat(projection1).describedAs("First projection should NOT exist (transaction rolled back)").isNull()

        val projection2 = projectionRepository.findByIdOrNull(event2.payload.id)
        assertThat(projection2).describedAs("Second projection should exist (transaction committed)").isNotNull()
        assertThat(projection2?.amount).isEqualTo(2000L)

        // Verify processed events
        val wasProcessed1 = processedEventRepository.hasBeenProcessed(UUID.fromString(event1.eventId))
        assertThat(wasProcessed1).describedAs("First event should NOT be marked as processed").isFalse()

        val wasProcessed2 = processedEventRepository.hasBeenProcessed(UUID.fromString(event2.eventId))
        assertThat(wasProcessed2).describedAs("Second event should be marked as processed").isTrue()
    }

    // ========== Helper Functions ==========

    private companion object {
        private const val DEFAULT_TIMESTAMP = 1_700_000_000_000L
        private const val DEFAULT_DATE = "2026-01-20T10:00:00Z"
    }

    private var timestampCounter = DEFAULT_TIMESTAMP

    private fun createTestEventEntry(
        eventId: UUID,
        expenseId: UUID,
        eventType: String,
        amount: Long,
        description: String = "Test expense",
        category: String = "Test",
        deleted: Boolean = false
    ): EventEntry {
        val timestamp = timestampCounter++
        return EventEntry(
            eventId = eventId.toString(),
            timestamp = timestamp,
            eventType = eventType,
            expenseId = expenseId.toString(),
            payload = ExpensePayload(
                id = expenseId,
                description = description,
                amount = amount,
                category = category,
                date = DEFAULT_DATE,
                updatedAt = timestamp,
                deleted = deleted
            )
        )
    }

    private suspend fun getAllProcessedEvents() =
        databaseClient.sql("SELECT event_id FROM processed_events")
            .fetch()
            .all()
            .collectList()
            .awaitSingle()
}
