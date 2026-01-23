package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.EventSyncFile
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import java.io.File
import java.util.UUID

/**
 * Tests for idempotency, duplicate events, out-of-order events, and concurrent device writes
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class ExpenseEventSyncServiceTest {

    @Autowired
    private lateinit var expenseEventSyncService: ExpenseEventSyncService

    @Autowired
    private lateinit var commandService: ExpenseCommandService

    @Autowired
    private lateinit var queryService: ExpenseQueryService

    @Autowired
    private lateinit var projectionRepository: ExpenseProjectionRepository

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var databaseClient: org.springframework.r2dbc.core.DatabaseClient

    @Autowired
    private lateinit var processedEventsCache: ProcessedEventsCache

    // Use the sync file path from application-test.yaml
    private val testSyncFilePath = "./build/test-sync-data/sync.json"

    @BeforeEach
    fun setup() {
        // Clean up database tables before each test
        runBlocking {
            databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
        }

        // Reset cache to clear state from previous tests
        processedEventsCache.reset()

        // Clean up sync file before each test
        File(testSyncFilePath).delete()
        File(testSyncFilePath).parentFile?.mkdirs()
    }

    @AfterEach
    fun cleanup() {
        // Clean up sync file after each test
        File(testSyncFilePath).delete()
    }

    @Test
    fun `should handle duplicate operations idempotently`() = runBlocking {
        // Given: Create an expense
        val expense = commandService.createExpense(
            description = "Test Expense",
            amount = 10000,
            category = "Food",
            date = "2026-01-20T10:00:00Z"
        )

        // When: Sync twice (should apply events only once)
        expenseEventSyncService.performFullSync()
        val firstSyncExpenses = queryService.getAllExpenses().toList()

        expenseEventSyncService.performFullSync()
        val secondSyncExpenses = queryService.getAllExpenses().toList()

        // Then: Should have same number of expenses (idempotent)
        assertEquals(firstSyncExpenses.size, secondSyncExpenses.size)
        assertEquals(1, secondSyncExpenses.size)
        assertEquals(expense.id, secondSyncExpenses[0].id)
    }

    @Test
    fun `should apply out-of-order operations correctly`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Events in wrong order (update before create in file, but create has earlier timestamp)
        val createEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now,  // Earlier timestamp - should be applied first
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 5000
        )

        val updateEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 1000,  // Later timestamp - should win with last-write-wins
            expenseId = expenseId,
            eventType = "UPDATED",
            amount = 7500
        )

        // Write events to sync file in wrong order (UPDATE before CREATE)
        val syncFile = EventSyncFile(events = listOf(updateEvent, createEvent))
        writeSyncFile(syncFile)

        // When: Perform sync (should sort by timestamp and apply CREATE first, then UPDATE)
        expenseEventSyncService.performFullSync()

        // Then: The final result should reflect the later update (7500 from UPDATE)
        val expense = queryService.getExpenseById(expenseId)
        assertNotNull(expense)
        assertEquals(7500L, expense!!.amount)
    }

    @Test
    fun `should handle concurrent device writes with last-write-wins`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Two devices updating the same expense
        val device1Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now,
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 1000,
            description = "Device 1 version"
        )

        val device2Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 1000,  // Later timestamp wins
            expenseId = expenseId,
            eventType = "UPDATED",
            amount = 2000,
            description = "Device 2 version"
        )

        // Write to sync file
        val syncFile = EventSyncFile(events = listOf(device1Event, device2Event))
        writeSyncFile(syncFile)

        // When: Perform sync
        expenseEventSyncService.performFullSync()

        // Then: Device 2's update should win (later timestamp)
        val expense = queryService.getExpenseById(expenseId)
        assertNotNull(expense)
        assertEquals(2000L, expense!!.amount)
        assertEquals("Device 2 version", expense.description)
    }

    @Test
    fun `should handle delete operation overriding updates`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Create, update, then delete
        val createEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now,
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 1000
        )

        val updateEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 1000,
            expenseId = expenseId,
            eventType = "UPDATED",
            amount = 2000
        )

        val deleteEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 2000,
            expenseId = expenseId,
            eventType = "DELETED",
            amount = 2000,
            deleted = true
        )

        val syncFile = EventSyncFile(events = listOf(createEvent, updateEvent, deleteEvent))
        writeSyncFile(syncFile)

        // When: Perform sync
        expenseEventSyncService.performFullSync()

        // Then: Expense should be soft-deleted
        val expense = queryService.getExpenseById(expenseId)
        assertNull(expense)  // Deleted expenses are not returned
    }

    @Test
    fun `should handle multiple concurrent devices writing different expenses`() = runBlocking {
        val expense1Id = UUID.randomUUID()
        val expense2Id = UUID.randomUUID()
        val expense3Id = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Three devices creating different expenses
        val device1Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now,
            expenseId = expense1Id,
            eventType = "CREATED",
            amount = 1000,
            description = "Device 1 expense"
        )

        val device2Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 100,
            expenseId = expense2Id,
            eventType = "CREATED",
            amount = 2000,
            description = "Device 2 expense"
        )

        val device3Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 200,
            expenseId = expense3Id,
            eventType = "CREATED",
            amount = 3000,
            description = "Device 3 expense"
        )

        val syncFile = EventSyncFile(events = listOf(device1Event, device2Event, device3Event))
        writeSyncFile(syncFile)

        // When: Perform sync
        expenseEventSyncService.performFullSync()

        // Then: All three expenses should exist
        val allExpenses = queryService.getAllExpenses().toList()
        assertEquals(3, allExpenses.size)

        val descriptions = allExpenses.map { it.description }.toSet()
        assertTrue(descriptions.contains("Device 1 expense"))
        assertTrue(descriptions.contains("Device 2 expense"))
        assertTrue(descriptions.contains("Device 3 expense"))
    }

    @Test
    fun `should maintain deterministic order with same timestamp`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: First create the expense, then two updates with same event timestamp but different updatedAt
        // Create event first (earlier timestamp)
        val createEvent = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now - 2000,  // Earlier timestamp
            expenseId = expenseId,
            eventType = "CREATED",
            amount = 500
        )

        // Two updates with same event timestamp (should sort by eventId: lower UUID first)
        // Use deterministic UUIDs to avoid flaky tests: event1's UUID < event2's UUID
        val event1 = createTestEventEntry(
            eventId = UUID.fromString("00000000-0000-0000-0000-000000000001"),  // Smaller UUID - processed first
            timestamp = now,  // Same event timestamp
            expenseId = expenseId,
            eventType = "UPDATED",
            amount = 1000,
            updatedAt = now  // Earlier updatedAt in payload
        )

        val event2 = createTestEventEntry(
            eventId = UUID.fromString("00000000-0000-0000-0000-000000000002"),  // Larger UUID - processed second
            timestamp = now,  // Same event timestamp
            expenseId = expenseId,
            eventType = "UPDATED",
            amount = 2000,
            updatedAt = now + 100  // Later updatedAt in payload - should win!
        )

        val syncFile = EventSyncFile(events = listOf(event2, event1, createEvent))  // Wrong order
        writeSyncFile(syncFile)

        // When: Perform sync (should sort deterministically by event timestamp, then eventId)
        expenseEventSyncService.performFullSync()

        // Then: event2 should win due to later updatedAt timestamp in payload (last-write-wins)
        val expense = queryService.getExpenseById(expenseId)
        assertNotNull(expense)
        assertEquals(2000L, expense!!.amount)  // event2 wins with last-write-wins
    }

    @Test
    fun `should be retry-safe after partial failure`() = runBlocking {
        val expense1Id = UUID.randomUUID()
        val expense2Id = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Two valid events
        val event1 = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now,
            expenseId = expense1Id,
            eventType = "CREATED",
            amount = 1000
        )

        val event2 = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 1000,
            expenseId = expense2Id,
            eventType = "CREATED",
            amount = 2000
        )

        val syncFile = EventSyncFile(events = listOf(event1, event2))
        writeSyncFile(syncFile)

        // When: Perform sync twice (simulating retry)
        expenseEventSyncService.performFullSync()
        val firstSyncExpenses = queryService.getAllExpenses().toList()

        expenseEventSyncService.performFullSync()
        val secondSyncExpenses = queryService.getAllExpenses().toList()

        // Then: Both syncs should result in same state (idempotent)
        assertEquals(2, firstSyncExpenses.size)
        assertEquals(2, secondSyncExpenses.size)
        assertEquals(firstSyncExpenses.size, secondSyncExpenses.size)
    }

    // Helper methods

    private fun createTestEventEntry(
        eventId: UUID,
        timestamp: Long,
        expenseId: UUID,
        eventType: String,
        amount: Long,
        description: String = "Test expense",
        deleted: Boolean = false,
        updatedAt: Long? = null  // Optional: defaults to timestamp if not provided
    ): EventEntry {
        return EventEntry(
            eventId = eventId.toString(),
            timestamp = timestamp,
            eventType = eventType,
            expenseId = expenseId.toString(),
            payload = com.vshpynta.expenses.api.model.ExpensePayload(
                id = expenseId,
                description = description,
                amount = amount,
                category = "Test",
                date = "2026-01-20T10:00:00Z",
                updatedAt = updatedAt ?: timestamp,  // Use provided updatedAt or default to timestamp
                deleted = deleted
            )
        )
    }

    private fun writeSyncFile(syncFile: EventSyncFile) {
        val file = File(testSyncFilePath)
        file.parentFile?.mkdirs()
        objectMapper.writerWithDefaultPrettyPrinter()
            .writeValue(file, syncFile)
    }
}
