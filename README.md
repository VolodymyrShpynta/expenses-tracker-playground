# Expenses Tracker with Event-Based Sync Engine

A fully reactive expense tracking application with **conflict-free, idempotent multi-device synchronization** built with
**Spring Boot 4**, **Kotlin Coroutines**, **R2DBC**, and **PostgreSQL**. This project implements an event sourcing-based
sync engine designed for eventual consistency across multiple devices without a central server authority.

## 📑 Table of Contents

- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Sync Engine Architecture](#-sync-engine-architecture)
    - [Design Principles](#design-principles)
    - [Event Sourcing Model](#event-sourcing-model)
    - [Database Schema](#database-schema)
    - [Conflict Resolution](#conflict-resolution)
    - [Sync Workflow](#sync-workflow)
    - [Idempotency Guarantees](#idempotency-guarantees)
- [Technical Decisions](#-technical-decisions)
    - [Why Event Sourcing](#why-event-sourcing)
    - [Why Timestamp-Only Conflict Resolution](#why-timestamp-only-conflict-resolution)
    - [Why No Delete Priority](#why-no-delete-priority)
    - [Why Separate SyncOperationExecutor](#why-separate-syncoperationexecutor)
    - [Why PostgreSQL for Tests](#why-postgresql-for-tests)
- [Getting Started](#-getting-started)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Android Migration Path](#-android-migration-path)
- [Troubleshooting](#-troubleshooting)
- [References](#-references)

---

## 🎯 Project Overview

This is a **multi-device expense tracker** with **serverless synchronization** using a shared file system (emulating
cloud storage like Dropbox, Google Drive, etc.). The sync engine is designed to be:

- ✅ **Conflict-free** - Automatic conflict resolution using last-write-wins
- ✅ **Idempotent** - Safe to retry operations without duplicates
- ✅ **Eventually consistent** - All devices converge to the same state
- ✅ **Portable** - Simple SQL designed for Android/SQLite migration
- ✅ **Transactional** - Atomic operations prevent partial state

### Real-World Use Case

**Scenario:** 2-3 users share expense tracking (e.g., family, roommates, travel group)

- Each user has their own device
- Devices sync through shared file (Dropbox, Google Drive, etc.)
- No internet connection required for local operations
- Changes sync automatically when file access available
- Conflicts resolved automatically (newest change wins)

---

## ✨ Key Features

### Sync Engine

- ✅ **Event Sourcing** - All changes captured as immutable operations
- ✅ **Last-Write-Wins** - Timestamp-based conflict resolution
- ✅ **Idempotent Operations** - Duplicate operations safely ignored
- ✅ **Out-of-Order Handling** - Operations applied correctly regardless of arrival order
- ✅ **Soft Delete** - Deleted expenses preserved for sync
- ✅ **Transactional Execution** - Atomic multi-step operations
- ✅ **Comprehensive Testing** - 50+ tests covering all sync scenarios

### Technology

- ✅ **Fully Reactive Stack** - Spring WebFlux + Kotlin Coroutines + R2DBC
- ✅ **REST API** - CRUD operations for expense management
- ✅ **Database Migrations** - Flyway with PostgreSQL
- ✅ **Testcontainers** - Real PostgreSQL for integration tests
- ✅ **Docker Support** - Complete containerized deployment

---

## 🛠 Technology Stack

### Core Framework

- **Spring Boot 4.0.1** - Latest with enhanced reactive support
- **Kotlin 2.2.21** - Modern JVM language with coroutines
- **Java 24** - Virtual threads support

### Reactive Stack

- **Spring WebFlux** - Non-blocking reactive web framework
- **Kotlin Coroutines** - Structured concurrency with suspend functions
- **R2DBC** - Reactive Relational Database Connectivity
    - Production & Tests: `r2dbc-postgresql` driver

### Database & Migrations

- **PostgreSQL 16** - Production database
- **Flyway** - Database migrations (JDBC-based)
- **R2DBC** - Runtime reactive queries
- **Testcontainers** - Real PostgreSQL for integration tests

### Build & Testing

- **Gradle 9.2.1+** with Kotlin DSL
- **JUnit 5** - Test framework
- **Mockito with @MockitoSpyBean** - Mocking framework
- **AssertJ** - Fluent assertions
- **Docker Compose** - Container orchestration

---

## 🏗 Sync Engine Architecture

### Design Principles

1. **Event Sourcing** - All changes are events in an append-only log
2. **Idempotency** - Operations can be applied multiple times safely
3. **Eventual Consistency** - All devices converge to same state
4. **No Central Server** - Peer-to-peer sync via shared file
5. **Portable SQL** - Simple queries for Android/SQLite migration
6. **Transaction Atomicity** - All steps succeed or all fail together

### Event Sourcing Model

Every expense modification (create, update, delete) generates an **operation** (event):

```kotlin
data class Operation(
    val opId: UUID,              // Unique operation identifier
    val ts: Long,                // Timestamp (milliseconds since epoch)
    val deviceId: String,        // Device that created the operation
    val operationType: OperationType,  // CREATE, UPDATE, DELETE
    val entityId: UUID,          // The expense being modified
    val payload: String,         // Complete expense state (JSON)
    val committed: Boolean = false  // Synced to file?
)
```

**Key insight:** Operations are immutable. Once created, they never change.

### Database Schema

The sync engine uses three tables working together:

#### **Table: `expenses`** (Materialized View)

Current state of all expenses:

```sql
CREATE TABLE expenses
(
    id          TEXT PRIMARY KEY,
    description TEXT    NOT NULL,
    amount      BIGINT  NOT NULL,
    category    TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    updated_at  BIGINT  NOT NULL,
    deleted     BOOLEAN NOT NULL DEFAULT FALSE
);
```

#### **Table: `operations`** (Event Log)

All modifications ever made:

```sql
CREATE TABLE operations
(
    op_id          TEXT PRIMARY KEY,
    ts             BIGINT  NOT NULL,
    device_id      TEXT    NOT NULL,
    operation_type TEXT    NOT NULL, -- CREATE, UPDATE, DELETE
    entity_id      TEXT    NOT NULL,
    payload        TEXT    NOT NULL, -- JSON
    committed      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_operations_uncommitted
    ON operations (device_id, committed) WHERE committed = false;
```

#### **Table: `applied_operations`** (Idempotency Registry)

Tracks which operations have been applied:

```sql
CREATE TABLE applied_operations
(
    op_id TEXT PRIMARY KEY
);
```

**Why three tables?**

- `expenses` - Fast queries for current state (materialized view)
- `operations` - Audit trail + sync source (event log)
- `applied_operations` - Prevents duplicate application (idempotency registry)

### Conflict Resolution

**Strategy: Last-Write-Wins (LWW)**

The operation with the **highest timestamp** wins. Simple, deterministic, and consistent.

#### **UPSERT Implementation**

```sql
INSERT INTO expenses (id, description, amount, category, date, updated_at, deleted)
VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO
UPDATE SET
    description = EXCLUDED.description,
    amount = EXCLUDED.amount,
    category = EXCLUDED.category,
    date = EXCLUDED.date,
    updated_at = EXCLUDED.updated_at,
    deleted = EXCLUDED.deleted
WHERE EXCLUDED.updated_at > expenses.updated_at;
```

**How it works:**

- ✅ Update **only if** new timestamp > old timestamp
- ✅ Older operations are **rejected** (returns 0 rows affected)
- ✅ Same operation twice is **idempotent** (no effect on second try)
- ✅ Works for CREATE, UPDATE, and DELETE (soft delete sets `deleted=true`)
- ✅ No special delete priority - **All operations follow same timestamp rule**

**Example scenarios:**

| Existing State                   | Operation                                   | Result                       |
|----------------------------------|---------------------------------------------|------------------------------|
| `updated_at=1000`                | Update with `updatedAt=2000`                | ✅ Updated (newer wins)       |
| `updated_at=2000`                | Update with `updatedAt=1000`                | ❌ Rejected (older loses)     |
| `updated_at=1000`                | Update with `updatedAt=1000`                | ❌ Rejected (equal timestamp) |
| `updated_at=2000, deleted=false` | Delete with `updatedAt=3000`                | ✅ Deleted (newer wins)       |
| `updated_at=2000, deleted=false` | Delete with `updatedAt=1000`                | ❌ Rejected (older loses)     |
| `updated_at=2000, deleted=true`  | Update with `updatedAt=3000, deleted=false` | ✅ Resurrected (newer wins)   |

### Sync Workflow

#### **Phase 1: Local Write (User Action)**

When a user creates/updates/deletes an expense:

```kotlin
@Transactional
suspend fun createExpense(
    description: String,
    amount: Long,
    category: String,
    date: String
): ExpenseResponse {
    val now = System.currentTimeMillis()
    val expense = SyncExpense(
        id = UUID.randomUUID(),
        description = description,
        amount = amount,
        category = category,
        date = date,
        updatedAt = now,
        deleted = false
    )

    // BEGIN TRANSACTION
    // 1. Insert into operations table (event log)
    val operation = Operation(
        opId = UUID.randomUUID(),
        ts = now,
        deviceId = deviceId,
        operationType = OperationType.CREATE,
        entityId = expense.id,
        payload = objectMapper.writeValueAsString(expense.toPayload()),
        committed = false
    )
    operationRepository.save(operation)

    // 2. Upsert into expenses table (if timestamp > existing)
    expenseRepository.upsertExpense(expense)
    // COMMIT TRANSACTION

    return expense.toResponse()
}
```

**Atomic guarantee:** Both tables updated together or not at all.

**Why create operation first?**

- If upsert fails, entire transaction rolls back
- No orphan operations without corresponding expense changes

#### **Phase 2: Collect Local Operations**

Gather uncommitted operations from this device:

```kotlin
suspend fun collectLocalOperations(): List<Operation> = withContext(Dispatchers.IO) {
    operationRepository.findUncommittedOperations(deviceId).toList()
}
```

**Query:**

```sql
SELECT *
FROM operations
WHERE device_id = ?
  AND committed = false
ORDER BY ts, op_id
```

#### **Phase 3: Upload to Shared File**

Append operations to shared JSON file:

```kotlin
suspend fun appendOperationsToFile(operations: List<Operation>) = withContext(Dispatchers.IO) {
    if (operations.isEmpty()) return@withContext

    val file = File(syncFilePath).apply {
        parentFile?.mkdirs()
    }

    // Read existing file or create new
    val syncFile = file.takeIf { it.exists() }
        ?.let { objectMapper.readValue(it, SyncFile::class.java) }
        ?: SyncFile()

    // Convert operations to OpEntry
    val newOpEntries = operations.map { it.toOpEntry() }

    // Append new operations
    val updatedSyncFile = syncFile.copy(ops = syncFile.ops + newOpEntries)
    objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, updatedSyncFile)

    logger.info("Appended ${operations.size} operations to sync file")
}
```

**Why not mark committed immediately?**

- Another device might fail to apply the operation
- We mark committed only after seeing our operation in the shared file (download phase)

#### **Phase 4: Download from Shared File**

Read all operations and sort deterministically:

```kotlin
suspend fun readRemoteOps(): List<OpEntry> = withContext(Dispatchers.IO) {
    val file = File(syncFilePath)

    file.takeIf { it.exists() }
        ?.let {
            runCatching {
                objectMapper.readValue(it, SyncFile::class.java).ops.sortedWith(
                    compareBy<OpEntry> { opEntry -> opEntry.ts }
                        .thenBy { opEntry -> opEntry.deviceId }
                        .thenBy { opEntry -> opEntry.opId }
                )
            }.getOrElse { e ->
                logger.error("Failed to read remote ops from sync file", e)
                emptyList()
            }
        }
        ?: emptyList()
}
```

**Sort order is critical:**

- Primary: `ts` (timestamp) - earlier operations first
- Secondary: `deviceId` - deterministic ordering for same timestamp
- Tertiary: `opId` - break ties

**Why this sorting?**

- Ensures deterministic ordering across all devices
- Operations applied in same order everywhere
- Guarantees eventual consistency

#### **Phase 5: Apply Operations Transactionally**

For each operation, apply it atomically:

```kotlin
suspend fun applyRemoteOperations(remoteOps: List<OpEntry>): Int = withContext(Dispatchers.IO) {
    remoteOps.count { opEntry ->
        runCatching<Boolean> {
            syncOperationExecutor.executeIfNotApplied(opEntry, deviceId)
        }.onFailure { e ->
            logger.error("Failed to apply op: ${opEntry.opId}", e)
        }.getOrDefault(false)
    }.also { appliedCount ->
        logger.info("Applied $appliedCount out of ${remoteOps.size} remote operations")
    }
}
```

**The core transactional operation:**

```kotlin
@Component
class SyncOperationExecutor {

    @Transactional
    suspend fun executeIfNotApplied(opEntry: OpEntry, currentDeviceId: String): Boolean =
        withContext(Dispatchers.IO) {
            val opId = UUID.fromString(opEntry.opId)

            // Step 1: Idempotency check
            if (appliedOperationRepository.hasBeenApplied(opId)) {
                logger.debug("Skipping already applied operation: {}", opId)
                return@withContext false
            }

            // Step 2: Apply to expenses table (UPSERT with timestamp check)
            applyExpenseModification(opEntry)

            // Step 3: Mark as applied
            appliedOperationRepository.markAsApplied(opId)

            // Step 4: If from our device, mark as committed
            if (opEntry.deviceId == currentDeviceId) {
                operationRepository.markOperationsAsCommitted(currentDeviceId, listOf(opId))
            }

            logger.debug(
                "Executed operation: {} (type={}, entity={})",
                opId, opEntry.opType, opEntry.entityId
            )

            true
        }
}
```

**Transaction guarantees:**

- All 4 steps succeed or all fail together
- No partial application
- Safe to retry
- Idempotent

### Sync File Format

**File:** `sync-data/sync.json`

```json
{
  "snapshot": {
    "version": 1,
    "expenses": []
  },
  "ops": [
    {
      "opId": "550e8400-e29b-41d4-a716-446655440000",
      "ts": 1737475200000,
      "deviceId": "device-001",
      "opType": "CREATE",
      "entityId": "c4f3d7e9-8b2a-4e6c-9d1f-5a8b3c7e2f0d",
      "payload": {
        "id": "c4f3d7e9-8b2a-4e6c-9d1f-5a8b3c7e2f0d",
        "description": "Coffee",
        "amount": 450,
        "category": "Food",
        "date": "2026-01-20T10:00:00Z",
        "updatedAt": 1737475200000,
        "deleted": false
      }
    },
    {
      "opId": "661f9511-f3ac-52e5-ae27-557766551111",
      "ts": 1737475300000,
      "deviceId": "device-002",
      "opType": "UPDATE",
      "entityId": "c4f3d7e9-8b2a-4e6c-9d1f-5a8b3c7e2f0d",
      "payload": {
        "id": "c4f3d7e9-8b2a-4e6c-9d1f-5a8b3c7e2f0d",
        "description": "Expensive Coffee",
        "amount": 950,
        "category": "Food",
        "date": "2026-01-20T10:00:00Z",
        "updatedAt": 1737475300000,
        "deleted": false
      }
    }
  ]
}
```

**Design notes:**

- `ops` array is append-only (never delete or modify)
- `snapshot` reserved for future optimization (full state snapshots)
- Operations contain complete expense state (not deltas)
- JSON format for human readability and debugging

### Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                         Device A                              │
│                                                               │
│  ┌─────────────┐      ┌──────────────────┐                  │
│  │ Controller  │─────►│ ExpenseService   │                  │
│  └─────────────┘      └────────┬─────────┘                  │
│                                 │                             │
│                                 ▼                             │
│                    ┌────────────────────────┐                │
│                    │  ExpenseWriteService   │                │
│                    │  (@Transactional)      │                │
│                    └──────────┬─────────────┘                │
│                               │                               │
│               ┌───────────────┴────────────────┐             │
│               ▼                                 ▼             │
│    ┌─────────────────────┐        ┌──────────────────────┐  │
│    │ OperationRepository │        │ ExpenseRepository    │  │
│    │ (operations table)  │        │ (expenses table)     │  │
│    └─────────────────────┘        └──────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              SyncService                            │    │
│  │  • collectLocalOperations()                         │    │
│  │  • appendOperationsToFile()  ───► sync.json        │    │
│  │  • readRemoteOps()           ◄─── sync.json        │    │
│  │  • applyRemoteOperations()                          │    │
│  └──────────────────┬──────────────────────────────────┘    │
│                     │                                        │
│                     ▼                                        │
│  ┌───────────────────────────────────────────────────┐     │
│  │    SyncOperationExecutor (@Transactional)        │     │
│  │    • executeIfNotApplied()                        │     │
│  └────────────────┬──────────────────────────────────┘     │
│                   │                                         │
│      ┌────────────┴────────────┬───────────────────┐       │
│      ▼                          ▼                   ▼       │
│ ┌──────────┐  ┌────────────────────┐  ┌───────────────┐   │
│ │ Expense  │  │ Applied Operations │  │  Operation    │   │
│ │Repository│  │ Repository         │  │  Repository   │   │
│ └──────────┘  └────────────────────┘  └───────────────┘   │
└───────────────────────────────────────────────────────────┘

                         ↕ sync.json ↕

┌───────────────────────────────────────────────────────────────┐
│                         Device B                               │
│                     (Same architecture)                        │
└───────────────────────────────────────────────────────────────┘
```

### Transaction Boundaries

**Local Write Transaction:**

```
BEGIN TRANSACTION
    INSERT INTO operations (op_id, ts, device_id, ...)
    INSERT INTO expenses (...) ON CONFLICT DO UPDATE WHERE ...
COMMIT
```

**Remote Operation Application Transaction:**

```
BEGIN TRANSACTION
    SELECT FROM applied_operations WHERE op_id = ?
    (if not applied):
        INSERT INTO expenses (...) ON CONFLICT DO UPDATE WHERE ...
        INSERT INTO applied_operations (op_id)
        UPDATE operations SET committed = true WHERE op_id = ? AND device_id = ?
COMMIT
```

**Why separate transactions?**

- Local write: Single operation, fast commit
- Remote apply: Many operations, resilient to individual failures
- Each remote operation independent - one failure doesn't stop others

### Idempotency Guarantees

#### **Application-Level Idempotency**

**Q: What if we apply the same operation twice?**

**A:** Prevented by `applied_operations` table:

```kotlin
// First application
if (!appliedOperationRepository.hasBeenApplied(opId)) {
    // Apply operation
    appliedOperationRepository.markAsApplied(opId)
}  // Returns true

// Second application (duplicate)
if (!appliedOperationRepository.hasBeenApplied(opId)) {
    // Skipped!
}  // Returns false
```

#### **Database-Level Idempotency**

**Q: What if UPSERT runs twice with same data?**

**A:** UPSERT with WHERE clause prevents updates:

```sql
ON CONFLICT (id) DO
UPDATE SET...WHERE EXCLUDED.updated_at > expenses.updated_at
```

If timestamp not newer → no update (returns 0 rows).

#### **Network Retry Idempotency**

**Q: What if network failure causes operation retry?**

**A:** Same mechanism - operation ID already in `applied_operations`:

```
Attempt 1: Apply op-123 → Success, inserted into applied_operations
Network error during response
Attempt 2: Apply op-123 → Skipped (already in applied_operations)
```

---

## 💡 Technical Decisions

### Why Event Sourcing?

**Benefits:**

1. ✅ **Complete Audit Trail** - Every change recorded with timestamp and device
2. ✅ **Time Travel** - Can rebuild state at any point in time
3. ✅ **Debugging** - Easy to see what happened and when
4. ✅ **Conflict Resolution** - Timestamp on each operation enables last-write-wins
5. ✅ **Eventual Consistency** - All devices converge by applying same operations

**Trade-offs:**

- ❌ More storage (operations + expenses tables)
- ❌ More complexity (two tables to maintain)
- ✅ **Worth it** for reliable multi-device sync

### Why Timestamp-Only Conflict Resolution?

**Original consideration:** Delete operations with special priority

**Decision:** Use timestamp-only for all operations

**Rationale:**

1. **Simplicity** - One rule for all operations (CREATE, UPDATE, DELETE)
2. **Consistency** - No special cases to remember
3. **Predictability** - Newest timestamp always wins
4. **True Last-Write-Wins** - User's most recent action honored

**Scenario analysis:**

```
Timeline:
t=1000: Create expense
t=1500: Delete expense (network delays this)
t=2000: Update expense

Without delete priority: Update wins (t=2000 > t=1500) ✅ Correct!
With delete priority: Delete wins (special rule) ❌ Wrong - user updated AFTER deleting
```

**Conclusion:** Timestamp-only is simpler and more correct.

### Why No Delete Priority?

**What we removed:**

```sql
-- Before: Delete overrides even with older timestamp
WHERE EXCLUDED.updated_at > expenses.updated_at OR EXCLUDED.deleted = true
```

**Why removed:**

- Creates counterintuitive behavior (older delete overrides newer update)
- Inconsistent (special rule just for deletes)
- Doesn't solve real problem (clock skew affects all operations, not just deletes)

**Current approach:**

```sql
-- After: Consistent rule for all operations
WHERE EXCLUDED.updated_at > expenses.updated_at
```

**Benefits:**

- ✅ All operations treated equally
- ✅ Intuitive (newest always wins)
- ✅ Simpler code
- ✅ Easier to explain
- ✅ Portable to Android/SQLite

### Why Separate SyncOperationExecutor?

**Problem:** Spring's `@Transactional` uses proxies

**Original attempt:**

```kotlin
class SyncService {
    @Transactional
    suspend fun applyOperation(op: OpEntry) {
        ...
    }

    suspend fun applyAll(ops: List<OpEntry>) {
        ops.forEach { applyOperation(it) }  // ❌ Direct call bypasses proxy!
    }
}
```

**Why it doesn't work:**

- Self-invocation bypasses Spring proxy
- `@Transactional` annotation ignored
- No transaction started!

**Solution:** Separate component

```kotlin
@Component
class SyncOperationExecutor {
    @Transactional
    suspend fun executeIfNotApplied(op: OpEntry) {
        ...
    }
}

class SyncService(
    private val syncOperationExecutor: SyncOperationExecutor  // Injected proxy!
) {
    suspend fun applyAll(ops: List<OpEntry>) {
        ops.forEach {
            syncOperationExecutor.executeIfNotApplied(it)  // ✅ Goes through proxy!
        }
    }
}
```

**Benefits:**

- ✅ Transactions work correctly
- ✅ Separation of concerns
- ✅ Testable with mocks

### Why PostgreSQL for Tests?

**Original approach:** H2 with PostgreSQL compatibility mode

**Problems encountered:**

1. H2's PostgreSQL mode has limitations
2. Different SQL dialect edge cases
3. Different query planner behavior
4. Hard to debug H2-specific issues

**Current approach:** Testcontainers with real PostgreSQL

**Benefits:**

- ✅ **Identical behavior** in tests and production
- ✅ **No compatibility surprises**
- ✅ **Test real SQL queries** including UPSERT with WHERE clause
- ✅ **Catch PostgreSQL-specific issues** early
- ✅ **Easy CI/CD integration** (Docker available in most CI systems)

**Trade-offs:**

- ❌ Slower test startup (~2-3 seconds for container)
- ❌ Requires Docker installed
- ✅ **Worth it** for reliability

---

## 🚀 Getting Started

### Prerequisites

- **Java 24** (or compatible JDK)
- **Docker & Docker Compose**
- **Gradle 9.2.1+** (or use included wrapper)

### Quick Start

#### 1. Clone & Build

```bash
git clone <your-repo-url>
cd expenses-tracker-playground
./gradlew build
```

#### 2. Start with Docker

```bash
docker-compose up -d
```

The application starts on `http://localhost:8080`

#### 3. Create an Expense

```bash
curl -X POST http://localhost:8080/api/v2/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Coffee",
    "amount": 450,
    "category": "Food",
    "date": "2026-01-20T10:00:00Z"
  }'
```

#### 4. Trigger Sync

```bash
curl -X POST http://localhost:8080/api/v2/expenses/sync
```

#### 5. Check Sync File

```bash
cat sync-data/sync.json
```

---

## 📡 API Documentation

### Endpoints

| Method | Endpoint                     | Description                   |
|--------|------------------------------|-------------------------------|
| POST   | `/api/v2/expenses`           | Create expense with sync      |
| GET    | `/api/v2/expenses`           | Get all expenses              |
| GET    | `/api/v2/expenses/{id}`      | Get expense by ID             |
| PUT    | `/api/v2/expenses/{id}`      | Update expense with sync      |
| DELETE | `/api/v2/expenses/{id}`      | Soft delete expense with sync |
| POST   | `/api/v2/expenses/sync`      | Trigger sync manually         |
| GET    | `/api/v2/expenses/device-id` | Get current device ID         |

### Examples

See `expenses-tracker-api.http` for complete examples.

---

## 🧪 Testing

### Test Coverage

**50+ tests** covering:

1. **Repository Tests** (23 tests)
    - UPSERT idempotency
    - Last-write-wins conflict resolution
    - Out-of-order operation handling
    - Soft delete behavior

2. **Service Transaction Tests** (8 tests)
    - Transaction atomicity
    - Rollback behavior
    - Independent transactions

3. **Sync Operation Executor Tests** (10 tests)
    - Transaction rollback scenarios
    - Idempotency guarantees
    - Failed operations isolation

4. **Sync Service Tests** (7 tests)
    - Duplicate operation handling
    - Out-of-order operations
    - Concurrent device writes
    - Last-write-wins with deletes

5. **Controller Tests** (5+ tests)
    - API endpoint integration
    - Request/response validation

### Running Tests

```bash
# Run all tests
./gradlew test

# Run specific test class
./gradlew test --tests ExpenseRepositoryTest

# Run with verbose output
./gradlew test --info

# Generate test report
./gradlew test
# Open: build/reports/tests/test/index.html
```

### Key Test Scenarios

**Idempotency:**

```kotlin
@Test
fun `upsertExpense should be idempotent`() {
    val expense = createExpense(id, "Test", 1000L, 1000L)

    val result1 = expenseRepository.upsertExpense(expense)
    val result2 = expenseRepository.upsertExpense(expense)

    assertEquals(1, result1, "First upsert should insert")
    assertEquals(0, result2, "Second upsert should have no effect")
}
```

**Out-of-Order Operations:**

```kotlin
@Test
fun `should apply out-of-order operations correctly`() {
    val id = UUID.randomUUID()

    // Operations arrive: 2, 1, 3
    expenseRepository.upsertExpense(createExpense(id, "Op 2", 2000L, 2000L))
    val result1 = expenseRepository.upsertExpense(createExpense(id, "Op 1", 1000L, 1000L))
    val result3 = expenseRepository.upsertExpense(createExpense(id, "Op 3", 3000L, 3000L))

    assertEquals(0, result1, "Op 1 should be rejected (older)")
    assertEquals(1, result3, "Op 3 should be applied (newer)")

    val saved = syncExpenseRepository.findByIdOrNull(id)
    assertEquals("Op 3", saved?.description)
}
```

**Transaction Rollback:**

```kotlin
@Test
fun `should rollback when upsertExpense fails`() {
    val opEntry = createTestOpEntry(...)
    val initialCount = getAllAppliedOperations().size

    // Configure spy to fail
    doAnswer { throw RuntimeException("Simulated failure") }
        .`when`(expenseRepository).upsertExpense(any())

    // Execute and expect failure
    assertThatThrownBy {
        runBlocking { syncOperationExecutor.executeIfNotApplied(opEntry, deviceId) }
    }.isInstanceOf(RuntimeException::class.java)

    // Verify rollback
    val countAfter = getAllAppliedOperations().size
    assertEquals(initialCount, countAfter, "Proves transaction rolled back!")
}
```

---

## 📱 Android Migration Path

The sync engine is designed for easy Android migration:

### Database

**Current (PostgreSQL):**

```sql
CREATE TABLE expenses
(
    id          TEXT PRIMARY KEY,
    description TEXT NOT NULL, .
    .
    .
)
```

**Android (Room + SQLite):**

```kotlin
@Entity(tableName = "expenses")
data class Expense(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "description") val description: String,
    ...
)
```

### Repositories

**Current (R2DBC):**

```kotlin
interface ExpenseRepository : CoroutineCrudRepository<SyncExpense, UUID> {
    @Query("INSERT INTO expenses ...")
    suspend fun upsertExpense(expense: SyncExpense): Int
}
```

**Android (Room):**

```kotlin
@Dao
interface ExpenseDao {
    @Query("INSERT INTO expenses ...")
    suspend fun upsertExpense(expense: Expense): Int
}
```

### Sync Service

**Portable:** Same Kotlin coroutine logic works on Android!

```kotlin
// This code works on both platforms!
suspend fun performFullSync() {
    val localOps = collectLocalOperations()
    appendOperationsToFile(localOps)
    val remoteOps = readRemoteOps()
    applyRemoteOperations(remoteOps)
}
```

### File Storage

**Current:** Local filesystem  
**Android:** `getExternalFilesDir()` or cloud SDK (Dropbox, Google Drive)

---

## 🔍 Troubleshooting

### Tests Failing

**Check Docker:**

```bash
docker ps
```

**View Testcontainer Logs:**

```bash
# Tests automatically clean up, check during test run
./gradlew test --info
```

### Sync Not Working

**Check sync file:**

```bash
ls -la sync-data/
cat sync-data/sync.json
```

**Check logs:**

```bash
docker logs expenses-api | grep -i sync
```

### Transaction Issues

**Verify @Transactional working:**

- Check `SyncOperationExecutor` is separate component
- Verify injection (not `this.method()` calls)
- Look for rollback in logs

---

## 📚 References

### Documentation

- [Spring Boot](https://docs.spring.io/spring-boot/reference/)
- [Kotlin Coroutines](https://kotlinlang.org/docs/coroutines-overview.html)
- [R2DBC](https://r2dbc.io/)
- [Spring Data R2DBC](https://docs.spring.io/spring-data/r2dbc/reference/)
- [Testcontainers](https://www.testcontainers.org/)

### Key Learnings

- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Last-Write-Wins Conflict Resolution](https://en.wikipedia.org/wiki/Eventual_consistency)
- [Spring @Transactional Proxy Pitfall](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)

---

**Built with ❤️ using Spring Boot 4, Kotlin, R2DBC, and PostgreSQL**

**Version:** 0.0.1-SNAPSHOT  
**Last Updated:** January 2026
