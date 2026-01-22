# Expenses Tracker with Event Sourcing & CQRS

A fully reactive expense tracking application with **conflict-free, idempotent multi-device synchronization** built with
**Spring Boot 4**, **Kotlin Coroutines**, **R2DBC**, and **PostgreSQL**. This project implements a complete **Event
Sourcing**
and **CQRS** architecture with an optimized sync engine designed for eventual consistency across multiple devices
without
a central server authority.

## 📑 Table of Contents

- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Sync Engine Architecture](#-sync-engine-architecture)
    - [Design Principles](#design-principles)
    - [Event Sourcing Model](#event-sourcing-model)
    - [CQRS Architecture](#cqrs-architecture)
    - [Database Schema](#database-schema)
    - [Conflict Resolution](#conflict-resolution)
    - [Sync Workflow](#sync-workflow)
    - [Idempotency Guarantees](#idempotency-guarantees)
- [Why This Architecture?](#-why-this-architecture)
    - [Event Sourcing Benefits](#event-sourcing-benefits)
    - [CQRS Benefits](#cqrs-benefits)
    - [Efficient Synchronization](#efficient-synchronization)
    - [Clear Domain Model](#clear-domain-model)
    - [Multi-Device Support](#multi-device-support)
- [Technical Decisions](#-technical-decisions)
    - [Why Event Sourcing](#why-event-sourcing)
    - [Why Timestamp-Only Conflict Resolution](#why-timestamp-only-conflict-resolution)
    - [Why Separate ExpenseEventProjector](#why-separate-expenseeventprojector)
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

### Event Sourcing & CQRS Architecture

- ✅ **Event Store** - All changes captured as immutable events in `expense_events` table (source of truth)
- ✅ **Projections** - Materialized view in `expense_projections` table for fast queries (read model)
- ✅ **CQRS Pattern** - Separate command service (writes) and query service (reads) for optimal performance
- ✅ **Complete Audit Trail** - Every change is permanently recorded as an event
- ✅ **Domain-Specific Naming** - Clear, business-focused terminology throughout the codebase

### Efficient Sync Engine

- ✅ **Network Optimized** - Single file download per sync cycle (minimal bandwidth usage)
- ✅ **Last-Write-Wins** - Simple, deterministic timestamp-based conflict resolution
- ✅ **Idempotent Operations** - Duplicate events safely ignored via `processed_events` table
- ✅ **Out-of-Order Handling** - Events applied correctly regardless of arrival order
- ✅ **Soft Delete** - Deleted expenses preserved for synchronization
- ✅ **Transactional Execution** - All-or-nothing operations ensure data consistency
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

The sync engine is built on these core principles:

1. **Event Sourcing** - All changes are immutable events in an append-only log
2. **CQRS** - Command Query Responsibility Segregation (separate read/write models)
3. **Idempotency** - Events can be processed multiple times safely without side effects
4. **Eventual Consistency** - All devices converge to the same state over time
5. **Decentralized** - No central server required - peer-to-peer sync via shared file
6. **Portable SQL** - Simple queries designed for easy Android/SQLite migration
7. **Transaction Atomicity** - All operations succeed together or fail together
8. **Network Efficiency** - Minimized data transfer with smart sync algorithm

### Event Sourcing Model

Every expense modification (create, update, delete) generates an **event**:

```kotlin
data class ExpenseEvent(
    val eventId: UUID,           // Unique event identifier
    val timestamp: Long,         // When the event occurred (milliseconds since epoch)
    val deviceId: String,        // Device that created the event
    val eventType: EventType,    // CREATED, UPDATED, DELETED
    val expenseId: UUID,         // The expense this event is about
    val payload: String,         // Complete expense state (JSON)
    val committed: Boolean = false  // Has been synced to file?
) : Persistable<UUID>
```

**Key insights:**

- Events are **immutable** - once created, they never change
- `eventId` identifies the event itself (unique per event)
- `expenseId` identifies which expense the event modifies (same across all events for one expense)
- Events form an **append-only log** - the source of truth

### CQRS Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CQRS Pattern                             │
└─────────────────────────────────────────────────────────────┘

Write Side (Commands):
  User Action → ExpenseCommandService
                    ↓
             Creates ExpenseEvent
                    ↓
          Saves to expense_events table
                    ↓
          Projects to expense_projections table
                    ↓
              Updates Read Model

Read Side (Queries):
  User Query → ExpenseQueryService
                    ↓
       Reads from expense_projections table
                    ↓
           Returns current state
```

### Database Schema

The sync engine uses **three tables** working together:

#### **Table: `expense_projections`** (Read Model / Materialized View)

Current state of all expenses (optimized for queries):

```sql
CREATE TABLE expense_projections
(
    id          VARCHAR(36) PRIMARY KEY,
    description VARCHAR(500),
    amount      BIGINT  NOT NULL,
    category    VARCHAR(100),
    date        VARCHAR(50),
    updated_at  BIGINT  NOT NULL,
    deleted     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_expense_projections_updated_at ON expense_projections (updated_at);
CREATE INDEX idx_expense_projections_deleted ON expense_projections (deleted);
CREATE INDEX idx_expense_projections_category ON expense_projections (category);
```

#### **Table: `expense_events`** (Event Store / Source of Truth)

Immutable append-only log of all modifications:

```sql
CREATE TABLE expense_events
(
    event_id   VARCHAR(36) PRIMARY KEY,
    timestamp  BIGINT       NOT NULL,
    device_id  VARCHAR(255) NOT NULL,
    event_type VARCHAR(20)  NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'DELETED')),
    expense_id VARCHAR(36)  NOT NULL,
    payload    TEXT         NOT NULL, -- JSON
    committed  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_expense_events_committed ON expense_events (committed);
CREATE INDEX idx_expense_events_device_id ON expense_events (device_id);
CREATE INDEX idx_expense_events_timestamp ON expense_events (timestamp);
CREATE INDEX idx_expense_events_expense_id ON expense_events (expense_id);
```

#### **Table: `processed_events`** (Idempotency Registry)

Tracks which events have been processed to prevent duplicates:

```sql
CREATE TABLE processed_events
(
    event_id VARCHAR(36) PRIMARY KEY
);

CREATE INDEX idx_processed_events_event_id ON processed_events (event_id);
```

**Why three tables?**

- `expense_projections` - Fast queries for current state (read model)
- `expense_events` - Complete audit trail + sync source (event store)
- `processed_events` - Prevents duplicate event processing (idempotency)

### Conflict Resolution

**Strategy: Last-Write-Wins (LWW)**

The event with the **highest timestamp** wins. Simple, deterministic, and consistent across all devices.

#### **Projection Update Implementation**

```sql
-- projectFromEvent() - Idempotent upsert with conflict resolution
INSERT INTO expense_projections (id, description, amount, category, date, updated_at, deleted)
VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO
UPDATE SET
    description = EXCLUDED.description,
    amount = EXCLUDED.amount,
    category = EXCLUDED.category,
    date = EXCLUDED.date,
    updated_at = EXCLUDED.updated_at,
    deleted = EXCLUDED.deleted
WHERE EXCLUDED.updated_at > expense_projections.updated_at;
```

**How it works:**

- ✅ Update **only if** new timestamp > old timestamp
- ✅ Older events are **rejected** (returns 0 rows affected)
- ✅ Same event twice is **idempotent** (no effect on second try)
- ✅ Works for CREATED, UPDATED, and DELETED (soft delete sets `deleted=true`)
- ✅ No special delete priority - **All events follow same timestamp rule**

**Example scenarios:**

| Existing State                   | Event                                        | Result                       |
|----------------------------------|----------------------------------------------|------------------------------|
| `updated_at=1000`                | UPDATED with `timestamp=2000`                | ✅ Updated (newer wins)       |
| `updated_at=2000`                | UPDATED with `timestamp=1000`                | ❌ Rejected (older loses)     |
| `updated_at=1000`                | UPDATED with `timestamp=1000`                | ❌ Rejected (equal timestamp) |
| `updated_at=2000, deleted=false` | DELETED with `timestamp=3000`                | ✅ Deleted (newer wins)       |
| `updated_at=2000, deleted=false` | DELETED with `timestamp=1000`                | ❌ Rejected (older loses)     |
| `updated_at=2000, deleted=true`  | UPDATED with `timestamp=3000, deleted=false` | ✅ Resurrected (newer wins)   |

### Sync Workflow

#### **Phase 1: Local Write (User Action)**

When a user creates/updates/deletes an expense (Command Side):

```kotlin
@Transactional
suspend fun createExpense(
    description: String,
    amount: Long,
    category: String,
    date: String
): ExpenseProjection {
    val now = clock.millis()
    val expenseId = UUID.randomUUID()

    val payload = ExpensePayload(
        id = expenseId,
        description = description,
        amount = amount,
        category = category,
        date = date,
        updatedAt = now,
        deleted = false
    )

    // BEGIN TRANSACTION
    // 1. Create and save immutable event to event store
    val event = ExpenseEvent(
        eventId = UUID.randomUUID(),
        timestamp = now,
        deviceId = deviceId,
        eventType = EventType.CREATED,
        expenseId = expenseId,
        payload = objectMapper.writeValueAsString(payload),
        committed = false
    )
    eventRepository.save(event)

    // 2. Project event to read model (if timestamp > existing)
    val projection = ExpenseProjection(
        id = expenseId,
        description = description,
        amount = amount,
        category = category,
        date = date,
        updatedAt = now,
        deleted = false
    )
    projectionRepository.projectFromEvent(projection)
    // COMMIT TRANSACTION

    return projection
}
```

**Atomic guarantee:** Both event store and projection updated together or not at all.

**Why save event first?**

- If projection fails, entire transaction rolls back
- No orphan events without corresponding projection changes
- Maintains consistency between event store and read model

#### **Phase 2: Efficient Sync Cycle**

The sync algorithm is designed for minimal network usage while maintaining consistency:

```kotlin
suspend fun performFullSync() {
    // 1. Download: Read remote events from sync file
    val remoteEvents = readRemoteOps()

    // 2. Process: Apply remote events from all devices
    applyRemoteOperations(remoteEvents)

    // 3. Collect: Get local uncommitted events
    val localEvents = collectLocalEvents()

    // 4. Upload: Append local events to file
    if (localEvents.isNotEmpty()) {
        appendEventsToFile(localEvents)
    }
}
```

**How it works:**

1. **Download Once** - Fetch the sync file containing all events from all devices
2. **Process First** - Apply remote events to update local read model
3. **Collect Local** - Gather events created on this device that haven't been synced yet
4. **Upload** - Append new local events to the shared sync file

**Why this order:**

- Minimizes network traffic - only one download per sync cycle
- Local events don't need immediate commit - they'll be processed by all devices (including this one) in the next sync
- Maintains eventual consistency across all devices
- Idempotency ensures correctness even if sync is interrupted

**Deferred Commit Pattern:**
Local events are marked as `committed=true` during the **next** sync cycle when this device reads them back from the
shared file. This is safe because:

- Events are already persisted in local database (won't be lost)
- Events are written to sync file (other devices can see them immediately)
- The slight delay doesn't affect consistency
- Reduces network operations significantly

#### **Phase 3: Event Processing with Idempotency**

```kotlin
@Transactional
suspend fun projectIfNotProcessed(
    eventEntry: EventEntry,
    currentDeviceId: String
): Boolean {
    val eventId = UUID.fromString(eventEntry.eventId)

    // Check if already processed (idempotency)
    if (processedEventRepository.hasBeenProcessed(eventId)) {
        return false  // Skip - already done
    }

    // BEGIN TRANSACTION
    // 1. Project event to read model
    when (EventType.valueOf(eventEntry.eventType)) {
        EventType.CREATED, EventType.UPDATED -> {
            val projection = eventEntry.payload.toProjection()
            projectionRepository.projectFromEvent(projection)
        }
        EventType.DELETED -> {
            projectionRepository.markAsDeleted(
                id = UUID.fromString(eventEntry.expenseId),
                updatedAt = eventEntry.payload.updatedAt
            )
        }
    }

    // 2. Mark event as processed (prevents re-processing)
    processedEventRepository.markAsProcessed(eventId)

    // 3. If from current device, mark as committed
    if (eventEntry.deviceId == currentDeviceId) {
        eventRepository.markEventsAsCommitted(currentDeviceId, listOf(eventId))
    }
    // COMMIT TRANSACTION

    return true
}
```

**Transaction atomicity ensures:**

- Either all 3 steps succeed, or all fail together
- No partial state
- Perfect consistency

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
│                         Device A                             │
│                                                              │
│  ┌─────────────┐      ┌──────────────────┐                   │
│  │ Controller  │─────►│ ExpenseService   │                   │
│  └─────────────┘      └────────┬─────────┘                   │
│                                │                             │
│                                ▼                             │
│                    ┌────────────────────────┐                │
│                    │  ExpenseWriteService   │                │
│                    │  (@Transactional)      │                │
│                    └──────────┬─────────────┘                │
│                               │                              │
│               ┌───────────────┴────────────────┐             │
│               ▼                                ▼             │
│    ┌─────────────────────┐        ┌──────────────────────┐   │
│    │ OperationRepository │        │ ExpenseRepository    │   │
│    │ (operations table)  │        │ (expenses table)     │   │
│    └─────────────────────┘        └──────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              SyncService                            │     │
│  │  • collectLocalOperations()                         │     │
│  │  • appendOperationsToFile()  ───► sync.json         │     │
│  │  • readRemoteOps()           ◄─── sync.json         │     │
│  │  • applyRemoteOperations()                          │     │
│  └──────────────────┬──────────────────────────────────┘     │
│                     │                                        │
│                     ▼                                        │
│  ┌───────────────────────────────────────────────────┐       │
│  │    SyncOperationExecutor (@Transactional)         │       │
│  │    • executeIfNotApplied()                        │       │
│  └────────────────┬──────────────────────────────────┘       │
│                   │                                          │
│      ┌────────────┴────────────┬───────────────────┐         │
│      ▼                         ▼                   ▼         │
│ ┌──────────┐  ┌────────────────────┐  ┌───────────────┐      │
│ │ Expense  │  │ Applied Operations │  │  Operation    │      │
│ │Repository│  │ Repository         │  │  Repository   │      │
│ └──────────┘  └────────────────────┘  └───────────────┘      │
└──────────────────────────────────────────────────────────────┘

                         ↕ sync.json ↕

┌───────────────────────────────────────────────────────────────┐
│                         Device B                              │
│                     (Same architecture)                       │
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

## 🎨 Why This Architecture?

### Event Sourcing Benefits

**Complete History & Audit Trail**

Every change to every expense is permanently recorded:

```sql
-- See complete history of an expense
SELECT event_id, timestamp, event_type, device_id
FROM expense_events
WHERE expense_id = 'c4f3d7e9-8b2a-4e6c-9d1f-5a8b3c7e2f0d'
ORDER BY timestamp;
```

Example output:

```
2026-01-15 10:00:00 | CREATED  | device-A | {amount: 1000, desc: "Coffee"}
2026-01-16 14:30:00 | UPDATED  | device-B | {amount: 1500, desc: "Coffee + Lunch"}
2026-01-17 09:15:00 | DELETED  | device-A | {deleted: true}
```

**Benefits:**

- Know exactly who changed what and when
- Debug synchronization issues easily
- Compliance and auditing requirements met
- Can answer "why is this expense $1500?" by looking at history

**Time Travel & Recovery**

Since events are immutable, you can:

- Rebuild state at any point in time
- Recover from data corruption
- Undo changes by replaying events
- Analyze trends over time

**Never Lose Data**

Events are **never deleted** - only appended:

- Deleted expenses are marked as deleted but events remain
- Can "undelete" by creating new event with newer timestamp
- Accidental changes can be tracked and reverted
- Complete forensic trail for troubleshooting

### CQRS Benefits

**Optimized Reads (Query Side)**

The `expense_projections` table is optimized for fast queries:

```kotlin
// Simple, fast query - no joins needed
suspend fun getAllExpenses(): Flow<ExpenseProjection> {
    return projectionRepository.findAll()
}

// Direct index access
suspend fun getExpensesByCategory(category: String): Flow<ExpenseProjection> {
    return projectionRepository.findByCategory(category)
}
```

**Benefits:**

- No complex joins
- Direct index usage
- Fast response times
- Can add specialized projections for different query patterns

**Optimized Writes (Command Side)**

The `expense_events` table is optimized for fast writes:

```kotlin
// Simple append - no updates, no conflicts
suspend fun createExpense(...): ExpenseProjection {
    val event = ExpenseEvent(...)
    eventRepository.save(event)  // Fast INSERT
    ...
}
```

**Benefits:**

- Append-only operations are extremely fast
- No update contention
- No complex WHERE clauses
- Natural fit for distributed systems

**Independent Scaling**

- Read model can be scaled separately from write model
- Can have multiple read models for different purposes
- Event store remains single source of truth

### Efficient Synchronization

**Minimal Network Usage**

The sync algorithm minimizes data transfer:

- Single download per sync cycle (fetch shared file once)
- Only uncommitted events are uploaded
- Events are small JSON payloads (~1KB each)
- Incremental sync - not full state transfer

**Bandwidth Example:**

```
Sync with 10 new local events + 5 remote events:
- Download: ~5KB (remote events)
- Upload: ~10KB (local events appended)
- Total: ~15KB per sync
```

Compare to full state sync:

```
Full state sync with 100 expenses:
- Download: ~100KB (all expenses)
- Upload: ~100KB (all expenses)
- Total: ~200KB per sync
```

**Idempotency = Safe Retries**

Network issues? No problem:

- Sync interrupted? Just retry - idempotency ensures correctness
- Same event processed twice? Safely skipped via `processed_events` table
- File uploaded twice? Idempotency prevents duplicates
- No risk of data corruption from retries

**Conflict Resolution Made Simple**

Last-write-wins based on timestamp:

- Clear rule: newest timestamp wins
- Applies to all operations (create, update, delete)
- Deterministic - all devices agree on final state
- No complex merge logic needed

**Example:**

```
Device A (timestamp: 1000): Sets amount to $50
Device B (timestamp: 2000): Sets amount to $75

Result on all devices: $75 (timestamp 2000 > 1000)
```

### Clear Domain Model

**Self-Documenting Code**

The codebase uses business domain language:

```kotlin
// ✅ Clear business meaning
event.expenseId          // Which expense this event is about
event.eventType          // CREATED, UPDATED, or DELETED
eventRepository          // Where events are stored
projectionRepository     // Where current state is stored
ExpenseCommandService    // Service for write operations
ExpenseQueryService      // Service for read operations
```

**No Technical Jargon Required:**

- No need to understand "aggregate root" - just "expense"
- No need to understand "entity ID" - just "expenseId"
- No need to understand "operation" vs "event" distinction
- Clear separation: events (what happened) vs projections (current state)

**Consistency Throughout:**

- All classes prefixed with domain term ("Expense")
- Database tables named after their purpose
- Method names describe business actions
- Comments explain "why" not just "what"

### Multi-Device Support

**Decentralized Architecture**

No central server needed:

- Devices sync via shared file (Dropbox, Google Drive, etc.)
- Works offline - sync when connection available
- No server maintenance or costs
- Natural fit for small teams (2-5 people)

**Eventual Consistency**

All devices eventually see the same data:

- Each device processes all events in same order (sorted by timestamp)
- Last-write-wins ensures deterministic conflict resolution
- No coordination required between devices
- Scales to reasonable number of devices

**Device Isolation**

Each device maintains its own:

- Event store (`expense_events` table)
- Read model (`expense_projections` table)
- Processed events registry (`processed_events` table)
- Works completely independently until sync

---

## 💡 Technical Decisions

### Why Event Sourcing?

Event Sourcing captures all changes as immutable events rather than updating a single "current state" record.

**Benefits:**

1. ✅ **Complete Audit Trail** - Every change recorded with timestamp and device
2. ✅ **Time Travel** - Can rebuild state at any point in time
3. ✅ **Debugging** - Easy to see what happened and when
4. ✅ **Conflict Resolution** - Timestamp on each event enables last-write-wins
5. ✅ **Eventual Consistency** - All devices converge by applying same events in same order

**Trade-offs:**

- More storage required (events table + projections table)
- More complexity (maintaining two tables instead of one)
- Worth it for reliable multi-device synchronization with audit trail

### Why Timestamp-Only Conflict Resolution?

The system uses a single, simple rule for conflict resolution: **the event with the newest timestamp wins**.

**The Rule:**

```sql
-- Update projection only if the event is newer
WHERE EXCLUDED.updated_at > expense_projections.updated_at
```

This applies uniformly to all event types:

- **CREATED** events
- **UPDATED** events
- **DELETED** events (soft delete - sets deleted flag)

**Why this approach:**

1. **Simplicity** - One rule for all operations, no special cases
2. **Consistency** - All event types treated the same way
3. **Predictability** - Newest timestamp always wins
4. **Intuitive** - User's most recent action is honored

**Example Scenario:**

```
Timeline:
t=1000: Device A creates expense "Coffee" ($5)
t=1500: Device B deletes the expense
t=2000: Device A updates to "Coffee + Lunch" ($12)

Result: Expense exists with $12 (update at t=2000 is newest)
Reason: User's latest action (update) is honored, not the older delete
```

**Why not special priority for DELETE?**

Giving deletes special priority (e.g., delete always wins regardless of timestamp) creates counterintuitive behavior:

- Older delete would override newer update
- Inconsistent with how creates and updates work
- Doesn't actually solve clock skew (affects all operations equally)

The timestamp-only approach is simpler and more predictable.

### Why Separate ExpenseEventProjector?

The `ExpenseEventProjector` class is separate from `ExpenseEventSyncService` to ensure transactions work correctly.

**The Problem:** Spring's `@Transactional` uses proxies. When you call a transactional method from within the same
class, it bypasses the proxy and disables transactions.

**Without separation (doesn't work):**

```kotlin
class ExpenseEventSyncService {
    @Transactional
    suspend fun projectIfNotProcessed(event: EventEntry) {
        // Process event atomically
    }

    suspend fun applyAll(events: List<EventEntry>) {
        events.forEach { projectIfNotProcessed(it) }  // ❌ Direct call bypasses proxy!
        // Transactions don't work!
    }
}
```

**With separation (works correctly):**

```kotlin
class ExpenseEventSyncService(
    private val eventProjector: ExpenseEventProjector  // Injected dependency
) {
    suspend fun applyAll(events: List<EventEntry>) {
        events.forEach {
            eventProjector.projectIfNotProcessed(it, deviceId)  // ✅ Goes through proxy!
        }
    }
}

@Component
class ExpenseEventProjector(...) {
    @Transactional
    suspend fun projectIfNotProcessed(event: EventEntry, deviceId: String) {
        // This transaction works correctly
        projectionRepository.projectFromEvent(...)
        processedEventRepository.markAsProcessed(...)
        eventRepository.markEventsAsCommitted(...)
    }
}
```

**Benefits:**

- ✅ Transactions work correctly (all-or-nothing guarantee)
- ✅ Rollback works on any failure
- ✅ Clean separation of concerns
- ✅ Testable components

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
