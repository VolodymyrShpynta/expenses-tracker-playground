package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.ExpensePayload
import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.repository.ProcessedEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
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
 * Tests for transaction atomicity in ExpenseEventProjector
 * Verifies that all database operations in projectIfNotProcessed are atomic:
 * - Check if processed
 * - Project event (upsert/delete expense projection)
 * - Mark as processed
 * - Mark as committed
 *
 * All steps must succeed or fail together.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class ExpenseEventProjectorTransactionTest {

    @Autowired
    private lateinit var expenseEventProjector: ExpenseEventProjector

    @MockitoSpyBean
    private lateinit var eventRepository: ExpenseEventRepository

    @MockitoSpyBean
    private lateinit var processedEventRepository: ProcessedEventRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoSpyBean
    private lateinit var projectionRepository: ExpenseProjectionRepository

    @Value("\${sync.device.id:device-test}")
    private lateinit var deviceId: String

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
        }
    }

    @Test
    fun `should execute all steps atomically - success case`() = runBlocking {
        // Given: A valid event entry
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 5000
        )

        // When: Projecting the event
        val result = expenseEventProjector.projectIfNotProcessed(eventEntry, deviceId)

        // Then: All steps should be completed
        assertTrue(result, "Event should be projected successfully")

        // Verify expense projection was created
        val projection = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertNotNull(projection, "Expense projection should be created")
        assertEquals(5000L, projection?.amount, "Expense amount should match")

        // Verify event was marked as processed
        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(eventEntry.eventId))
        assertTrue(wasProcessed, "Event should be marked as processed")
    }

    @Test
    fun `should rollback all steps when expense projection fails`() = runBlocking {
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
                expenseEventProjector.projectIfNotProcessed(eventEntry, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated projection failure")

        // Then: Nothing should be committed (entire transaction rolled back)
        val projectionsAfter = projectionRepository.findAll().toList()
        val processedEventsAfter = getAllProcessedEvents()

        assertEquals(
            initialProjectionCount, projectionsAfter.size,
            "NO projections should be created - projection failed as expected"
        )
        assertEquals(
            initialProcessedEventsCount, processedEventsAfter.size,
            "NO processed events should be recorded - proves atomicity! " +
                    "If this fails, the transaction is not atomic!"
        )

        // Double-check: Event should NOT be marked as processed
        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(eventEntry.eventId))
        assertFalse(wasProcessed, "Event should NOT be marked as processed when transaction rolls back")
    }

    @Test
    fun `should rollback all steps when marking as processed fails`() = runBlocking {
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
                expenseEventProjector.projectIfNotProcessed(eventEntry, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated markAsProcessed failure")

        // Then: Entire transaction should be rolled back
        val projectionsAfter = projectionRepository.findAll().toList()

        assertEquals(
            initialProjectionCount, projectionsAfter.size,
            "NO projections should be created - proves projection was rolled back when markAsProcessed failed! " +
                    "If this fails, @Transactional is not working!"
        )

        // Verify projection was NOT created (rollback worked)
        val projection = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertNull(projection, "Projection should NOT exist - entire transaction rolled back")
    }

    @Test
    fun `should rollback all steps when marking as committed fails`() = runBlocking {
        // Given: A valid event from our device, spy configured to fail on markAsCommitted
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            deviceId = deviceId,  // Same as current device
            eventType = "CREATED",
            amount = 5000
        )

        val initialProjectionCount = projectionRepository.findAll().toList().size
        val initialProcessedEventsCount = getAllProcessedEvents().size

        // Configure spy to fail when marking as committed
        doAnswer {
            throw RuntimeException("Simulated markAsCommitted failure - testing rollback")
        }.`when`(eventRepository).markEventsAsCommitted(any(), any())

        // When: Attempting to project event (should fail at markAsCommitted)
        assertThatThrownBy {
            runBlocking {
                expenseEventProjector.projectIfNotProcessed(eventEntry, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("Simulated markAsCommitted failure")

        // Then: Entire transaction should be rolled back
        val projectionsAfter = projectionRepository.findAll().toList()
        val processedEventsAfter = getAllProcessedEvents()

        assertEquals(
            initialProjectionCount, projectionsAfter.size,
            "NO projections should be created - proves atomicity across all steps!"
        )
        assertEquals(
            initialProcessedEventsCount, processedEventsAfter.size,
            "NO processed events should be recorded - proves atomicity!"
        )

        // Verify nothing was persisted
        val projection = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertNull(projection, "Projection should NOT exist - entire transaction rolled back")

        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(eventEntry.eventId))
        assertFalse(wasProcessed, "Event should NOT be marked as processed")
    }

    @Test
    fun `should skip already processed events without modifying data`() = runBlocking {
        // Given: An event that was already processed
        val eventEntry = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = UUID.randomUUID(),
            eventType = "CREATED",
            amount = 5000
        )

        // First execution - should succeed
        val firstResult = expenseEventProjector.projectIfNotProcessed(eventEntry, deviceId)
        assertTrue(firstResult, "First execution should succeed")

        val projectionAfterFirst = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertNotNull(projectionAfterFirst, "Projection should exist after first execution")
        val firstUpdatedAt = projectionAfterFirst!!.updatedAt

        // When: Projecting the same event again (idempotency check)
        val secondResult = expenseEventProjector.projectIfNotProcessed(eventEntry, deviceId)

        // Then: Should be skipped, no modifications
        assertFalse(secondResult, "Second execution should return false (already processed)")

        val projectionAfterSecond = projectionRepository.findByIdOrNull(eventEntry.payload.id)
        assertNotNull(projectionAfterSecond, "Projection should still exist")
        assertEquals(
            firstUpdatedAt, projectionAfterSecond!!.updatedAt,
            "Projection should NOT be modified on second execution (idempotency)"
        )
    }

    @Test
    fun `should handle DELETED event atomically`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val createEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 5000
        )
        expenseEventProjector.projectIfNotProcessed(createEvent, deviceId)

        // When: Deleting the expense
        val deleteEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "DELETED",
            amount = 5000,
            deleted = true
        )
        val deleteResult = expenseEventProjector.projectIfNotProcessed(deleteEvent, deviceId)

        // Then: All steps should complete atomically
        assertTrue(deleteResult, "Delete event should be projected successfully")

        val projection = projectionRepository.findByIdOrNull(expenseId)
        assertNotNull(projection, "Projection should still exist (soft delete)")
        assertTrue(projection!!.deleted, "Projection should be marked as deleted")

        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(deleteEvent.eventId))
        assertTrue(wasProcessed, "Delete event should be marked as processed")
    }

    @Test
    fun `should handle UPDATED event atomically`() = runBlocking {
        // Given: An existing expense
        val expenseId = UUID.randomUUID()
        val createEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 1000,
            description = "Original"
        )
        expenseEventProjector.projectIfNotProcessed(createEvent, deviceId)

        // When: Updating the expense
        val updateEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            expenseId = expenseId,
            eventType = "UPDATED",
            amount = 2000,
            description = "Updated"
        )
        val updateResult = expenseEventProjector.projectIfNotProcessed(updateEvent, deviceId)

        // Then: All steps should complete atomically
        assertTrue(updateResult, "Update event should be projected successfully")

        val projection = projectionRepository.findByIdOrNull(expenseId)
        assertNotNull(projection, "Projection should exist")
        assertEquals(2000L, projection!!.amount, "Amount should be updated")
        assertEquals("Updated", projection.description, "Description should be updated")

        val wasProcessed = processedEventRepository.hasBeenProcessed(UUID.fromString(updateEvent.eventId))
        assertTrue(wasProcessed, "Update event should be marked as processed")
    }

    @Test
    fun `failed events should not affect subsequent successful events`() = runBlocking {
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
                expenseEventProjector.projectIfNotProcessed(event1, deviceId)
            }
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("First event projection fails")

        // Reset the spy to allow real method calls for the second event
        Mockito.reset(projectionRepository)

        // Then: Executing second event (succeeds with real implementation)
        val result2 = expenseEventProjector.projectIfNotProcessed(event2, deviceId)
        assertTrue(result2, "Second event should be projected successfully")

        // Verify: First event rolled back, second committed
        val projection1 = projectionRepository.findByIdOrNull(event1.payload.id)
        assertNull(projection1, "First projection should NOT exist (transaction rolled back)")

        val projection2 = projectionRepository.findByIdOrNull(event2.payload.id)
        assertNotNull(projection2, "Second projection should exist (transaction committed)")
        assertEquals(2000L, projection2?.amount)

        // Verify processed events
        val wasProcessed1 = processedEventRepository.hasBeenProcessed(UUID.fromString(event1.eventId))
        assertFalse(wasProcessed1, "First event should NOT be marked as processed")

        val wasProcessed2 = processedEventRepository.hasBeenProcessed(UUID.fromString(event2.eventId))
        assertTrue(wasProcessed2, "Second event should be marked as processed")
    }

    // ========== Helper Functions ==========

    private fun createTestEventEntry(
        eventId: UUID,
        expenseId: UUID,
        eventType: String,
        amount: Long,
        description: String = "Test expense",
        category: String = "Test",
        deviceId: String = "device-test",
        deleted: Boolean = false
    ): EventEntry {
        val now = System.currentTimeMillis()
        return EventEntry(
            eventId = eventId.toString(),
            timestamp = now,
            deviceId = deviceId,
            eventType = eventType,
            expenseId = expenseId.toString(),
            payload = ExpensePayload(
                id = expenseId,
                description = description,
                amount = amount,
                category = category,
                date = Instant.now().toString(),
                updatedAt = now,
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
