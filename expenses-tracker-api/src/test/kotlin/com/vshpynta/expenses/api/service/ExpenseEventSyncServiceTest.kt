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

        // When: Apply events (should sort by timestamp and apply CREATE first, then UPDATE)
        val remoteOps = expenseEventSyncService.readRemoteOps()
        val appliedCount = expenseEventSyncService.applyRemoteOperations(remoteOps)

        // Then: Both events should be applied
        assertEquals(2, appliedCount)

        // And the final result should reflect the later update (7500 from UPDATE)
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
            deviceId = "device-1",
            eventType = "CREATED",
            amount = 1000,
            description = "Device 1 version"
        )

        val device2Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 1000,  // Later timestamp wins
            expenseId = expenseId,
            deviceId = "device-2",
            eventType = "UPDATED",
            amount = 2000,
            description = "Device 2 version"
        )

        // Write to sync file
        val syncFile = EventSyncFile(events = listOf(device1Event, device2Event))
        writeSyncFile(syncFile)

        // When: Apply events
        val remoteOps = expenseEventSyncService.readRemoteOps()
        expenseEventSyncService.applyRemoteOperations(remoteOps)

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

        // When: Apply events
        val remoteOps = expenseEventSyncService.readRemoteOps()
        expenseEventSyncService.applyRemoteOperations(remoteOps)

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
            deviceId = "device-1",
            eventType = "CREATED",
            amount = 1000,
            description = "Device 1 expense"
        )

        val device2Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 100,
            expenseId = expense2Id,
            deviceId = "device-2",
            eventType = "CREATED",
            amount = 2000,
            description = "Device 2 expense"
        )

        val device3Event = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now + 200,
            expenseId = expense3Id,
            deviceId = "device-3",
            eventType = "CREATED",
            amount = 3000,
            description = "Device 3 expense"
        )

        val syncFile = EventSyncFile(events = listOf(device1Event, device2Event, device3Event))
        writeSyncFile(syncFile)

        // When: Apply events
        val remoteOps = expenseEventSyncService.readRemoteOps()
        expenseEventSyncService.applyRemoteOperations(remoteOps)

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

        // Given: Two events with same timestamp (should sort by device_id then event_id)
        val event1 = createTestEventEntry(
            eventId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            timestamp = now,
            expenseId = expenseId,
            deviceId = "device-a",
            eventType = "CREATED",
            amount = 1000
        )

        val event2 = createTestEventEntry(
            eventId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
            timestamp = now,  // Same timestamp
            expenseId = expenseId,
            deviceId = "device-b",
            eventType = "UPDATED",
            amount = 2000
        )

        val syncFile = EventSyncFile(events = listOf(event2, event1))  // Wrong order
        writeSyncFile(syncFile)

        // When: Read and sort events
        val remoteOps = expenseEventSyncService.readRemoteOps()

        // Then: Should be sorted deterministically
        assertEquals("device-a", remoteOps[0].deviceId)
        assertEquals("device-b", remoteOps[1].deviceId)
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

        // When: Apply events twice (simulating retry)
        val remoteOps = expenseEventSyncService.readRemoteOps()
        val firstApply = expenseEventSyncService.applyRemoteOperations(remoteOps)
        val secondApply = expenseEventSyncService.applyRemoteOperations(remoteOps)

        // Then: First sync should apply both, second should apply none (idempotent)
        assertEquals(2, firstApply)
        assertEquals(0, secondApply)

        // And both expenses should exist
        val allExpenses = queryService.getAllExpenses().toList()
        assertEquals(2, allExpenses.size)
    }

    // Helper methods

    private fun createTestEventEntry(
        eventId: UUID,
        timestamp: Long,
        expenseId: UUID,
        deviceId: String = "test-device",
        eventType: String,
        amount: Long,
        description: String = "Test expense",
        deleted: Boolean = false
    ): EventEntry {
        return EventEntry(
            eventId = eventId.toString(),
            timestamp = timestamp,
            deviceId = deviceId,
            eventType = eventType,
            expenseId = expenseId.toString(),
            payload = com.vshpynta.expenses.api.model.ExpensePayload(
                id = expenseId,
                description = description,
                amount = amount,
                category = "Test",
                date = "2026-01-20T10:00:00Z",
                updatedAt = timestamp,
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
