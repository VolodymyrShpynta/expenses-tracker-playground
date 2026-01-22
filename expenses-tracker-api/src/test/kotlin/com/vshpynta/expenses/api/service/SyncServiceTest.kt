package com.vshpynta.expenses.api.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.model.OpEntry
import com.vshpynta.expenses.api.model.SyncFile
import com.vshpynta.expenses.api.repository.ExpenseRepository
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
 * Tests for idempotency, duplicate ops, out-of-order ops, and concurrent device writes
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class)
class SyncServiceTest {

    @Autowired
    private lateinit var syncService: SyncService

    @Autowired
    private lateinit var expenseService: ExpenseService

    @Autowired
    private lateinit var upsertRepository: ExpenseRepository

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
            databaseClient.sql("DELETE FROM applied_operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM operations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expenses").fetch().rowsUpdated().awaitSingle()
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
        val expense = expenseService.createExpense(
            description = "Test Expense",
            amount = 10000,
            category = "Food",
            date = "2026-01-20T10:00:00Z"
        )

        // When: Sync twice (should apply ops only once)
        syncService.performFullSync()
        val firstSyncExpenses = expenseService.getAllExpenses().toList()

        syncService.performFullSync()
        val secondSyncExpenses = expenseService.getAllExpenses().toList()

        // Then: Should have same number of expenses (idempotent)
        assertEquals(firstSyncExpenses.size, secondSyncExpenses.size)
        assertEquals(1, secondSyncExpenses.size)
        assertEquals(expense.id, secondSyncExpenses[0].id)
    }

    @Test
    fun `should apply out-of-order operations correctly`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Operations in wrong order (update before create in file, but create has earlier timestamp)
        val createOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now,  // Earlier timestamp - should be applied first
            entityId = expenseId,
            opType = "CREATE",
            amount = 5000
        )

        val updateOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now + 1000,  // Later timestamp - should win with last-write-wins
            entityId = expenseId,
            opType = "UPDATE",
            amount = 7500
        )

        // Write ops to sync file in wrong order (UPDATE before CREATE)
        val syncFile = SyncFile(ops = listOf(updateOp, createOp))
        writeSyncFile(syncFile)

        // When: Apply ops (should sort by timestamp and apply CREATE first, then UPDATE)
        val remoteOps = syncService.readRemoteOps()
        val appliedCount = syncService.applyRemoteOperations(remoteOps)

        // Then: Both ops should be applied
        assertEquals(2, appliedCount)

        // And the final result should reflect the later update (7500 from UPDATE)
        val expense = expenseService.getExpenseById(expenseId)
        assertNotNull(expense)
        assertEquals(7500L, expense!!.amount)
    }

    @Test
    fun `should handle concurrent device writes with last-write-wins`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Two devices updating the same expense
        val device1Op = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now,
            entityId = expenseId,
            deviceId = "device-1",
            opType = "CREATE",
            amount = 1000,
            description = "Device 1 version"
        )

        val device2Op = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now + 1000,  // Later timestamp wins
            entityId = expenseId,
            deviceId = "device-2",
            opType = "UPDATE",
            amount = 2000,
            description = "Device 2 version"
        )

        // Write to sync file
        val syncFile = SyncFile(ops = listOf(device1Op, device2Op))
        writeSyncFile(syncFile)

        // When: Apply ops
        val remoteOps = syncService.readRemoteOps()
        syncService.applyRemoteOperations(remoteOps)

        // Then: Device 2's update should win (later timestamp)
        val expense = expenseService.getExpenseById(expenseId)
        assertNotNull(expense)
        assertEquals(2000L, expense!!.amount)
        assertEquals("Device 2 version", expense.description)
    }

    @Test
    fun `should handle delete operation overriding updates`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Create, update, then delete
        val createOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now,
            entityId = expenseId,
            opType = "CREATE",
            amount = 1000
        )

        val updateOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now + 1000,
            entityId = expenseId,
            opType = "UPDATE",
            amount = 2000
        )

        val deleteOp = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now + 2000,
            entityId = expenseId,
            opType = "DELETE",
            amount = 2000,
            deleted = true
        )

        val syncFile = SyncFile(ops = listOf(createOp, updateOp, deleteOp))
        writeSyncFile(syncFile)

        // When: Apply ops
        val remoteOps = syncService.readRemoteOps()
        syncService.applyRemoteOperations(remoteOps)

        // Then: Expense should be soft-deleted
        val expense = expenseService.getExpenseById(expenseId)
        assertNull(expense)  // Deleted expenses are not returned
    }

    @Test
    fun `should handle multiple concurrent devices writing different expenses`() = runBlocking {
        val expense1Id = UUID.randomUUID()
        val expense2Id = UUID.randomUUID()
        val expense3Id = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Three devices creating different expenses
        val device1Op = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now,
            entityId = expense1Id,
            deviceId = "device-1",
            opType = "CREATE",
            amount = 1000,
            description = "Device 1 expense"
        )

        val device2Op = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now + 100,
            entityId = expense2Id,
            deviceId = "device-2",
            opType = "CREATE",
            amount = 2000,
            description = "Device 2 expense"
        )

        val device3Op = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now + 200,
            entityId = expense3Id,
            deviceId = "device-3",
            opType = "CREATE",
            amount = 3000,
            description = "Device 3 expense"
        )

        val syncFile = SyncFile(ops = listOf(device1Op, device2Op, device3Op))
        writeSyncFile(syncFile)

        // When: Apply ops
        val remoteOps = syncService.readRemoteOps()
        syncService.applyRemoteOperations(remoteOps)

        // Then: All three expenses should exist
        val allExpenses = expenseService.getAllExpenses().toList()
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

        // Given: Two ops with same timestamp (should sort by device_id then op_id)
        val op1 = createTestOpEntry(
            opId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            ts = now,
            entityId = expenseId,
            deviceId = "device-a",
            opType = "CREATE",
            amount = 1000
        )

        val op2 = createTestOpEntry(
            opId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
            ts = now,  // Same timestamp
            entityId = expenseId,
            deviceId = "device-b",
            opType = "UPDATE",
            amount = 2000
        )

        val syncFile = SyncFile(ops = listOf(op2, op1))  // Wrong order
        writeSyncFile(syncFile)

        // When: Read and sort ops
        val remoteOps = syncService.readRemoteOps()

        // Then: Should be sorted deterministically
        assertEquals("device-a", remoteOps[0].deviceId)
        assertEquals("device-b", remoteOps[1].deviceId)
    }

    @Test
    fun `should be retry-safe after partial failure`() = runBlocking {
        val expense1Id = UUID.randomUUID()
        val expense2Id = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Given: Two valid ops
        val op1 = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now,
            entityId = expense1Id,
            opType = "CREATE",
            amount = 1000
        )

        val op2 = createTestOpEntry(
            opId = UUID.randomUUID(),
            ts = now + 1000,
            entityId = expense2Id,
            opType = "CREATE",
            amount = 2000
        )

        val syncFile = SyncFile(ops = listOf(op1, op2))
        writeSyncFile(syncFile)

        // When: Apply ops twice (simulating retry)
        val remoteOps = syncService.readRemoteOps()
        val firstApply = syncService.applyRemoteOperations(remoteOps)
        val secondApply = syncService.applyRemoteOperations(remoteOps)

        // Then: First sync should apply both, second should apply none (idempotent)
        assertEquals(2, firstApply)
        assertEquals(0, secondApply)

        // And both expenses should exist
        val allExpenses = expenseService.getAllExpenses().toList()
        assertEquals(2, allExpenses.size)
    }

    // Helper methods

    private fun createTestOpEntry(
        opId: UUID,
        ts: Long,
        entityId: UUID,
        deviceId: String = "test-device",
        opType: String,
        amount: Long,
        description: String = "Test expense",
        deleted: Boolean = false
    ): OpEntry {
        return OpEntry(
            opId = opId.toString(),
            ts = ts,
            deviceId = deviceId,
            opType = opType,
            entityId = entityId.toString(),
            payload = com.vshpynta.expenses.api.model.ExpensePayload(
                id = entityId,
                description = description,
                amount = amount,
                category = "Test",
                date = "2026-01-20T10:00:00Z",
                updatedAt = ts,
                deleted = deleted
            )
        )
    }

    private fun writeSyncFile(syncFile: SyncFile) {
        val file = File(testSyncFilePath)
        file.parentFile?.mkdirs()
        objectMapper.writerWithDefaultPrettyPrinter()
            .writeValue(file, syncFile)
    }
}
