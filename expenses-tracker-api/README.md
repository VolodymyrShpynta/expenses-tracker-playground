# Expenses Tracker — Backend API

A **Kotlin + Spring Boot 4 (WebFlux + Coroutines + R2DBC)** reactive REST API that implements
**event-sourced, CQRS-based** expense tracking with file-based multi-device synchronization.

> **Where this module fits.** This module is the authoritative event store and projection layer for the
> web frontend ([`expenses-tracker-frontend`](../expenses-tracker-frontend/README.md)). The mobile app
> ([`expenses-tracker-mobile`](../expenses-tracker-mobile/README.md)) is fully offline-first and does
> **not** depend on this backend — it ports the same sync engine to TypeScript and exchanges sync files
> through Google Drive / OneDrive.
>
> For the cross-cutting **Sync Engine Architecture**, **event-sourcing model**, **CQRS rationale**,
> and the **PKCE authentication flow** diagram, see the [root README](../README.md). This README focuses
> on running, configuring, testing, and tuning the backend itself.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Tech Stack](#-tech-stack)
- [Running the Backend](#-running-the-backend)
    - [Prerequisites](#prerequisites)
    - [Start PostgreSQL and Keycloak](#start-postgresql-and-keycloak)
    - [Run the API server](#run-the-api-server)
    - [Building](#building)
- [Configuration](#-configuration)
    - [Environment Variables](#environment-variables)
    - [Application Configuration (`application.yaml`)](#application-configuration-applicationyaml)
- [Database Migrations (Flyway)](#-database-migrations-flyway)
- [API Documentation](#-api-documentation)
    - [Endpoints](#endpoints)
    - [Quick API Test](#quick-api-test)
    - [HTTP Client Environment Configuration](#http-client-environment-configuration)
- [Testing](#-testing)
    - [Test Coverage](#test-coverage)
    - [Running Tests](#running-tests)
    - [Test Infrastructure](#test-infrastructure)
    - [Key Test Scenarios](#key-test-scenarios)
- [Performance Optimization: Batch Processing (Recommended)](#-performance-optimization-batch-processing-recommended)
    - [Current Implementation](#current-implementation)
    - [Recommended Production Optimization](#recommended-production-optimization)
    - [Database Compatibility](#database-compatibility)
    - [Performance Comparison](#performance-comparison)
    - [When to Optimize](#when-to-optimize)
    - [PostgreSQL-Specific Optimization (Most Efficient)](#postgresql-specific-optimization-most-efficient)
- [Troubleshooting](#-troubleshooting)
    - [Tests Failing](#tests-failing)
    - [Sync Not Working](#sync-not-working)
    - [Transaction Issues](#transaction-issues)
    - [Connection Issues](#connection-issues)
- [Related Documentation](#-related-documentation)

---

## 🎯 Overview

The backend is a reactive Spring Boot application that:

- Exposes a **REST API** at `/api/expenses` and `/api/categories`.
- Validates JWT Bearer tokens issued by **Keycloak** (resource-server mode, no session cookies).
- Persists events in `expense_events` (source of truth) and a materialized read model in
  `expense_projections` — both updated atomically in a single `@Transactional` boundary.
- Synchronizes with other devices through a shared sync file (gzip-compressed JSON), reconciling
  conflicts last-write-wins by timestamp.
- Uses **R2DBC** for reactive runtime queries and a separate **JDBC** datasource for Flyway migrations
  (Flyway has no reactive support yet).

The path-scoped Copilot rules for this module live in
[`.github/instructions/expenses-tracker-api.instructions.md`](../.github/instructions/expenses-tracker-api.instructions.md).

---

## 🛠 Tech Stack

- **Kotlin** — 100% Kotlin codebase
- **Spring Boot 4** with WebFlux + Spring Coroutines (`suspend` controllers, `Flow` results)
- **Spring Security OAuth2 Resource Server** — validates Keycloak JWTs via JWK Set URI
- **R2DBC** — reactive PostgreSQL driver (runtime queries)
- **JDBC** — separate datasource for Flyway only
- **PostgreSQL 17** — single database for events, projections, idempotency registry, categories
- **Flyway** — versioned (`V1__…`) + repeatable (`R__…`) migrations
- **JUnit 5** + **Testcontainers** — integration tests with real PostgreSQL
- **AssertJ** + **Mockito-Kotlin** — assertions + spying for transaction-rollback tests
- **Gradle 9.4** with the version catalog at [`gradle/libs.versions.toml`](../gradle/libs.versions.toml)

---

## 🚀 Running the Backend

### Prerequisites

- **Java 21** (or a compatible JDK)
- **Docker & Docker Compose** (for PostgreSQL, Keycloak, and Testcontainers)
- **Gradle 9.4.0** or use the included wrapper (`./gradlew`)

### Start PostgreSQL and Keycloak

```bash
docker compose up -d postgres keycloak
```

Keycloak starts on **http://localhost:8180** and auto-imports the `expenses-tracker` realm from
`keycloak/realm-export.json`. The realm includes a pre-configured `expenses-frontend` client
(public, PKCE) and a test user (`testuser` / `password`). Self-registration is enabled.

Admin console: **http://localhost:8180/auth/admin** (admin / admin).

### Run the API server

```bash
./gradlew :expenses-tracker-api:bootRun
```

The backend API starts on **http://localhost:8080**.

### Building

```bash
# Backend only
./gradlew :expenses-tracker-api:build

# Backend executable jar
./gradlew :expenses-tracker-api:bootJar

# Whole monorepo (backend + frontend)
./gradlew build
```

---

## ⚙ Configuration

### Environment Variables

The application can be configured via environment variables:

**Database (R2DBC):**

- `EXPENSES_TRACKER_R2DBC_URL` — R2DBC connection URL (default: `r2dbc:postgresql://localhost:5432/expenses_db`)
- `EXPENSES_TRACKER_R2DBC_USERNAME` — Database username (default: `postgres`)
- `EXPENSES_TRACKER_R2DBC_PASSWORD` — Database password (default: `postgres`)

**Database (Flyway Migrations):**

- `EXPENSES_TRACKER_FLYWAY_JDBC_URL` — JDBC URL for migrations (default: `jdbc:postgresql://localhost:5432/expenses_db`)
- `EXPENSES_TRACKER_FLYWAY_USERNAME` — Migration username (default: `postgres`)
- `EXPENSES_TRACKER_FLYWAY_PASSWORD` — Migration password (default: `postgres`)

**Sync Configuration:**

- `SYNC_FILE_PATH` — Path to sync file (default: `./sync-data/sync.json`)
- `SYNC_FILE_COMPRESSION_ENABLED` — Enable gzip compression (default: `true`)

> The variables above only configure the **backend's** local-filesystem sync path. The mobile module does
> not read any of them — its sync configuration lives in source as committed constants
> (`GOOGLE_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_ID`, see
> [`expenses-tracker-mobile/README.md`](../expenses-tracker-mobile/README.md)). OAuth tokens themselves
> are persisted in `expo-secure-store` (Keychain / Keystore) at runtime — never in source.

**Authentication (Keycloak):**

- `KEYCLOAK_ISSUER_URI` — Keycloak JWT issuer URI (default: `http://localhost:3000/auth/realms/expenses-tracker`)
- `KEYCLOAK_JWK_SET_URI` — JWK set endpoint for key fetching (default: same host as issuer)
- `KC_ADMIN` / `KC_ADMIN_PASSWORD` — Keycloak admin credentials (default: `admin` / `admin`)

### Application Configuration (`application.yaml`)

```yaml
spring:
  application:
    name: expenses-tracker-api
  r2dbc:
    url: ${EXPENSES_TRACKER_R2DBC_URL:r2dbc:postgresql://localhost:5432/expenses_db}
    username: ${EXPENSES_TRACKER_R2DBC_USERNAME:postgres}
    password: ${EXPENSES_TRACKER_R2DBC_PASSWORD:postgres}
    pool:
      initial-size: 5
      max-size: 20
      max-idle-time: 30m
      validation-query: SELECT 1
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    datasource:
      jdbc-url: ${EXPENSES_TRACKER_FLYWAY_JDBC_URL:jdbc:postgresql://localhost:5432/expenses_db}
      username: ${EXPENSES_TRACKER_FLYWAY_USERNAME:postgres}
      password: ${EXPENSES_TRACKER_FLYWAY_PASSWORD:postgres}
      driver-class-name: org.postgresql.Driver
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${KEYCLOAK_ISSUER_URI:http://localhost:3000/auth/realms/expenses-tracker}
          jwk-set-uri: ${KEYCLOAK_JWK_SET_URI:http://localhost:8180/auth/realms/expenses-tracker/protocol/openid-connect/certs}

sync:
  file:
    path: ${SYNC_FILE_PATH:./sync-data/sync.json}
    compression:
      enabled: ${SYNC_FILE_COMPRESSION_ENABLED:true}
```

> The runtime data path uses R2DBC (`spring.r2dbc.*`) while Flyway uses a **separate JDBC datasource**
> (`spring.flyway.datasource.*`). This is by design: Flyway has no reactive support and reactive code
> must not block on schema migrations.

---

## 🗄 Database Migrations (Flyway)

Migrations live under `src/main/resources/db/migration/`:

| File                                  | Type                                       | Purpose                                                 |
|---------------------------------------|--------------------------------------------|---------------------------------------------------------|
| `V1__Initial_schema.sql`              | Versioned (runs once, never modified)      | Creates the four core tables + indexes.                 |
| `R__Seed_default_categories.sql`      | Repeatable (re-runs when its hash changes) | Seeds language-agnostic default category templates.     |

The schema and the rationale behind each table are documented in detail in the
[**Sync Engine Architecture — Database Schema** section of the root README](../README.md#database-schema).

---

## 📡 API Documentation

### Endpoints

All endpoints (except health check) require a valid JWT Bearer token.

| Method | Endpoint               | Description                       |
|--------|------------------------|-----------------------------------|
| POST   | `/api/expenses`        | Create expense                    |
| GET    | `/api/expenses`        | Get all expenses (current user)   |
| GET    | `/api/expenses/{id}`   | Get expense by ID                 |
| PUT    | `/api/expenses/{id}`   | Update expense                    |
| DELETE | `/api/expenses/{id}`   | Soft delete expense               |
| POST   | `/api/expenses/sync`   | Trigger sync manually             |
| GET    | `/api/categories`      | Get all categories (current user) |
| GET    | `/api/categories/{id}` | Get category by ID                |
| POST   | `/api/categories`      | Create category                   |
| PUT    | `/api/categories/{id}` | Update category                   |
| DELETE | `/api/categories/{id}` | Delete category                   |
| GET    | `/actuator/health`     | Health check (no auth required)   |

See [`expenses-tracker-api.http`](../expenses-tracker-api.http) for complete request examples.

### Quick API Test

> **Note:** All API endpoints (except `/actuator/health`) require a valid JWT Bearer token from Keycloak.
> Use the frontend UI for the easiest experience, or obtain a token via Keycloak's token endpoint:

**Get a token (using test user):**

```bash
TOKEN=$(curl -s -X POST 'http://localhost:8180/realms/expenses-tracker/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&client_id=expenses-frontend&username=testuser&password=password' \
  | jq -r '.access_token')
```

**Create an Expense:**

```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "description": "Coffee",
    "amount": 450,
    "category": "Food",
    "date": "2026-01-20T10:00:00Z"
  }'
```

**Trigger Sync:**

```bash
curl -X POST http://localhost:8080/api/expenses/sync \
  -H "Authorization: Bearer $TOKEN"
```

### HTTP Client Environment Configuration

The project includes `http-client.env.json` for configuring API endpoints across different environments when using the
HTTP client in IntelliJ IDEA or similar IDEs.

#### File Location

```
expenses-tracker-playground/
├── expenses-tracker-api.http      # HTTP request examples
└── http-client.env.json           # Environment configuration
```

#### Configuration Format

```json
{
  "local": {
    "ExpensesApiUrl": "http://localhost:8080"
  },
  "docker": {
    "ExpensesApiUrl": "http://localhost:8080"
  },
  "prod": {
    "ExpensesApiUrl": "https://expenses-api.example.com"
  }
}
```

#### Available Environments

| Environment | Variable         | Default Value                      | Use Case                          |
|-------------|------------------|------------------------------------|-----------------------------------|
| `local`     | `ExpensesApiUrl` | `http://localhost:8080`            | Local development (Gradle run)    |
| `docker`    | `ExpensesApiUrl` | `http://localhost:8080`            | Docker Compose deployment         |
| `prod`      | `ExpensesApiUrl` | `https://expenses-api.example.com` | Production deployment (customize) |

#### How to Use

**1. In IntelliJ IDEA / WebStorm:**

- Open `expenses-tracker-api.http`
- Select environment from dropdown (top-right corner): `local`, `docker`, or `prod`
- Click the green "Run" arrow next to any request
- The `{{ExpensesApiUrl}}` variable will be replaced with the selected environment's URL

**2. In VS Code with REST Client extension:**

- Install the "REST Client" extension
- Open `expenses-tracker-api.http`
- Select environment from status bar or command palette
- Click "Send Request" above any request

**3. Usage in HTTP Requests:**

All requests in `expenses-tracker-api.http` use the `{{ExpensesApiUrl}}` variable:

```http
### Get All Expenses
GET {{ExpensesApiUrl}}/api/expenses
Accept: application/json

### Create Expense
POST {{ExpensesApiUrl}}/api/expenses
Content-Type: application/json

{
  "description": "Coffee",
  "amount": 450,
  "category": "Food",
  "date": "2026-01-24T10:00:00Z"
}
```

#### Customizing for Your Environment

**For local development on a different port:**

```json
{
  "local": {
    "ExpensesApiUrl": "http://localhost:9090"
  }
}
```

**For remote server testing:**

```json
{
  "staging": {
    "ExpensesApiUrl": "https://expenses-api-staging.example.com"
  },
  "production": {
    "ExpensesApiUrl": "https://expenses-api.example.com"
  }
}
```

**With authentication:**

```json
{
  "prod": {
    "ExpensesApiUrl": "https://expenses-api.example.com",
    "AuthToken": "Bearer <your-keycloak-jwt-token>"
  }
}
```

Then use in requests:

```http
GET {{ExpensesApiUrl}}/api/expenses
Authorization: {{AuthToken}}
```

#### Tips

- ✅ **Version control**: Safe to commit `http-client.env.json` with default values
- ✅ **Secrets**: For sensitive data, use `.env.private` (auto-ignored by IntelliJ)
- ✅ **Multiple environments**: Add as many environments as needed
- ✅ **Team collaboration**: Shared configuration helps team members test consistently

#### Alternative: Using curl

If you prefer curl, replace the variable manually:

```bash
# Local
API_URL="http://localhost:8080"

# Get all expenses
curl -X GET "$API_URL/api/expenses" -H "Accept: application/json"

# Create expense
curl -X POST "$API_URL/api/expenses" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Coffee",
    "amount": 450,
    "category": "Food",
    "date": "2026-01-24T10:00:00Z"
  }'
```

---

## 🧪 Testing

> **Mobile module:** the mobile app has its own pure-TypeScript test suite — **56+ Vitest tests** covering
> the projector, codec, sync engine, OAuth client, and remote event applier. Run it with
> `cd expenses-tracker-mobile && npm test`, or via Gradle: `./gradlew :expenses-tracker-mobile:check`
> (lint + Vitest + `tsc -b`). The sections below describe the **backend** test suite.

### Test Coverage

**Comprehensive test suite** covering:

1. **Command Service Transaction Tests** - `ExpenseCommandServiceTransactionTest`
    - Transaction atomicity for create/update/delete operations
    - Rollback behavior on failures
    - Event and projection creation in single transaction

2. **Event Projector Transaction Tests** - `ExpenseSyncProjectorTransactionTest`
    - Transaction rollback scenarios
    - Idempotency guarantees (event already processed)
    - Failed projection isolation
    - Atomic operations across all database tables

3. **Sync Service Integration Tests** - `ExpenseEventSyncServiceTest`
    - Duplicate event handling (idempotency)
    - Out-of-order event application
    - Concurrent device writes simulation
    - Last-write-wins conflict resolution
    - Sync file compression and decompression

4. **Controller Integration Tests** - `SyncExpenseControllerTest`
    - Full API endpoint integration
    - Request/response validation
    - CRUD operations end-to-end testing

5. **Repository Tests** - `ExpenseProjectionRepositoryTest`
    - UPSERT idempotency verification
    - Last-write-wins conflict resolution
    - Out-of-order operation handling
    - Soft delete behavior

### Running Tests

```bash
# Run all tests
./gradlew test

# Run with coverage report
./gradlew test jacocoTestReport

# Run specific test class
./gradlew test --tests ExpenseEventSyncServiceTest
./gradlew test --tests ExpenseCommandServiceTransactionTest
./gradlew test --tests ExpenseSyncProjectorTransactionTest

# Run tests with verbose output
./gradlew test --info

# Generate test report (open after running)
./gradlew test
# Report location: expenses-tracker-api/build/reports/tests/test/index.html
```

### Test Infrastructure

The project uses **Testcontainers** with real PostgreSQL for integration testing:

- ✅ Identical database behavior in tests and production
- ✅ No H2 compatibility issues
- ✅ Real SQL query validation
- ✅ Automatic container lifecycle management
- ✅ Parallel test execution support

**Test Configuration:** `application-test.yaml`

```yaml
spring:
  # Testcontainers will automatically configure both R2DBC and JDBC via @ServiceConnection
  # This requires Docker to be running!
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true

sync:
  file:
    path: ./build/test-sync-data/sync.json
    compression:
      enabled: false  # Disable compression in tests for simplicity
```

Many tests do **manual DB cleanup via `DatabaseClient` before each test** because reactive tests do not
rely on classic transactional test rollback semantics. The shared Testcontainers configuration is in
`src/test/kotlin/com/vshpynta/expenses/api/config/TestContainersConfig.kt`.

Path-scoped test conventions live in
[`.github/instructions/test-conventions.instructions.md`](../.github/instructions/test-conventions.instructions.md).

### Key Test Scenarios

**Idempotency:**

```kotlin
@Test
fun `should handle duplicate operations idempotently`() = runBlocking {
        // Create an expense
        val expense = commandService.createExpense(
            description = "Test Expense",
            amount = 10000,
            currency = "USD",
            categoryId = categoryId,
            date = "2026-01-20T10:00:00Z"
        )

        // Sync twice (should apply events only once)
        expenseEventSyncService.performFullSync()
        val firstSyncExpenses = queryService.findAllExpenses().toList()
        expenseEventSyncService.performFullSync()
        val secondSyncExpenses = queryService.findAllExpenses().toList()

        // Both syncs should result in same state (idempotent)
        assertEquals(firstSyncExpenses.size, secondSyncExpenses.size)
    }
```

**Out-of-Order Events:**

```kotlin
@Test
fun `should apply out-of-order operations correctly`() = runBlocking {
        val expenseId = UUID.randomUUID()
        val now = System.currentTimeMillis()

        // Create events with different timestamps
        val event1 = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now - 1000, amount = 1000
        )
        val event2 = createTestEventEntry(
            eventId = UUID.randomUUID(),
            timestamp = now, amount = 2000
        )

        // Apply in reverse order (event2 first, then event1)
        val syncFile = EventSyncFile(events = listOf(event2, event1))
        writeSyncFile(syncFile)

        expenseEventSyncService.performFullSync()

        // Should have event2's data (newer timestamp wins)
        val expenses = queryService.findAllExpenses().toList()
        assertEquals(2000L, expenses[0].amount)
    }
```

**Transaction Rollback:**

```kotlin
@Test
fun `should rollback all steps when expense projection fails`() = runBlocking {
        val eventEntry = createTestEventEntry(...)
        val initialProjectionCount = projectionRepository.findAll().toList().size
        val initialProcessedEventsCount = getAllProcessedEvents().size

        // Configure spy to fail on projection
        doAnswer { throw RuntimeException("Simulated projection failure") }
            .`when`(projectionRepository).projectFromEvent(any())

        // Execute and expect failure
        assertThatThrownBy {
            runBlocking { expenseSyncProjector.projectEvent(eventEntry) }
        }.isInstanceOf(RuntimeException::class.java)

        // Verify rollback - no changes persisted
        val projectionsAfter = projectionRepository.findAll().toList()
        val processedEventsAfter = getAllProcessedEvents()

        assertEquals(initialProjectionCount, projectionsAfter.size)
        assertEquals(initialProcessedEventsCount, processedEventsAfter.size)
    }
```

---

## 🚀 Performance Optimization: Batch Processing (Recommended)

### Current Implementation

The current codebase uses **sequential processing within a transaction**:

```kotlin
@Transactional
suspend fun projectFromEventBatch(projections: List<ExpenseProjection>): Int {
    return projections.count { projection ->
        projectFromEvent(projection) > 0  // N database calls
    }
}
```

**Characteristics:**

- ✅ **Simple & Maintainable** - Easy to understand, reuses existing methods
- ✅ **Atomic** - Single transaction ensures all-or-nothing
- ✅ **Portable** - Works on any database
- ⚠️ **Performance** - Makes N database calls (acceptable for validation/playground)

---

### Recommended Production Optimization

For production systems handling large sync batches, implement **true batch processing** using multi-row SQL operations.

#### Option 1: Multi-Row INSERT (PostgreSQL + SQLite 3.24+)

**Implementation using DatabaseClient with dynamic SQL:**

```kotlin
@Component
class ExpenseProjectionRepositoryCustomImpl(
    private val databaseClient: DatabaseClient
) : ExpenseProjectionRepositoryCustom {

    @Transactional
    override suspend fun projectFromEventBatch(projections: List<ExpenseProjection>): Int {
        if (projections.isEmpty()) return 0

        // Generate VALUES placeholders: (?, ?, ...), (?, ?, ...), (?, ?, ...)
        val valuesPlaceholders = projections.joinToString(", ") { "(?, ?, ?, ?, ?, ?, ?)" }

        val sql = """
            INSERT INTO expense_projections (id, description, amount, category, date, updated_at, deleted)
            VALUES $valuesPlaceholders
            ON CONFLICT (id) DO UPDATE SET
                description = EXCLUDED.description,
                amount = EXCLUDED.amount,
                category = EXCLUDED.category,
                date = EXCLUDED.date,
                updated_at = EXCLUDED.updated_at,
                deleted = EXCLUDED.deleted
            WHERE EXCLUDED.updated_at > expense_projections.updated_at
        """.trimIndent()

        // Bind parameters using extension function
        val spec = databaseClient.sql(sql).bindProjections(projections)

        return spec.fetch().rowsUpdated().awaitSingle().toInt()
    }
}

// Extension function for clean parameter binding
private fun DatabaseClient.GenericExecuteSpec.bindProjections(
    projections: List<ExpenseProjection>
): DatabaseClient.GenericExecuteSpec {
    var spec = this
    var paramIndex = 0

    projections.forEach { projection ->
        spec = spec
            .bind(paramIndex++, projection.id)                    // R2DBC UuidToStringConverter handles UUID->String
            .bindNullable(paramIndex++, projection.description)   // Nullable string
            .bind(paramIndex++, projection.amount)                // Non-null long
            .bindNullable(paramIndex++, projection.category)      // Nullable string
            .bindNullable(paramIndex++, projection.date)          // Nullable string
            .bind(paramIndex++, projection.updatedAt)             // Non-null long
            .bind(paramIndex++, projection.deleted)               // Non-null boolean
    }

    return spec
}

// Helper for nullable binding
private fun DatabaseClient.GenericExecuteSpec.bindNullable(
    index: Int,
    value: String?
): DatabaseClient.GenericExecuteSpec {
    return if (value != null) bind(index, value) else bindNull(index, String::class.java)
}
```

**Performance:**

- ✅ **1 database call** for N projections (vs N calls)
- ✅ **60-100x faster** for large batches
- ✅ **Reduced network latency**

#### Option 2: Batch UPDATE with VALUES Clause

**For batch delete operations:**

```kotlin
@Transactional
override suspend fun markAsDeletedBatch(ids: List<UUID>, updatedAts: List<Long>): Int {
    if (ids.isEmpty()) return 0
    require(ids.size == updatedAts.size) { "ids and updatedAts must have the same size" }

    // Generate VALUES placeholders: (?, ?), (?, ?), (?, ?)
    val valuesPlaceholders = ids.indices.joinToString(", ") { "(?, ?)" }

    val sql = """
        UPDATE expense_projections
        SET deleted = true,
            updated_at = updates.updated_at
        FROM (VALUES $valuesPlaceholders) AS updates(id, updated_at)
        WHERE expense_projections.id = updates.id
          AND expense_projections.updated_at < updates.updated_at
    """.trimIndent()

    val spec = databaseClient.sql(sql).bindDeleteBatch(ids, updatedAts)

    return spec.fetch().rowsUpdated().awaitSingle().toInt()
}

private fun DatabaseClient.GenericExecuteSpec.bindDeleteBatch(
    ids: List<UUID>,
    updatedAts: List<Long>
): DatabaseClient.GenericExecuteSpec {
    var spec = this
    var paramIndex = 0

    ids.forEachIndexed { index, id ->
        spec = spec
            .bind(paramIndex++, id)
            .bind(paramIndex++, updatedAts[index])
    }

    return spec
}
```

---

### Database Compatibility

| Feature                      | PostgreSQL     | SQLite           | MySQL                     | H2            |
|------------------------------|----------------|------------------|---------------------------|---------------|
| Multi-row INSERT             | ✅ All versions | ✅ 3.24+          | ✅ Yes                     | ✅ Yes         |
| ON CONFLICT DO UPDATE        | ✅ 9.5+         | ✅ 3.24+ (UPSERT) | ✅ 8.0+ (ON DUPLICATE KEY) | ✅ Yes (MERGE) |
| UPDATE ... FROM (VALUES ...) | ✅ All versions | ✅ 3.33+ (2020)   | ⚠️ Different syntax       | ✅ Yes         |

**For maximum portability:** Use the simple sequential approach (current implementation)  
**For production performance:** Implement batch operations with database-specific optimization

---

### Performance Comparison

**Test scenario: Sync batch of 100 events**

| Approach                 | DB Calls        | SQL Type           | Complexity | Performance               |
|--------------------------|-----------------|--------------------|------------|---------------------------|
| **Sequential (Current)** | 100             | Individual INSERTs | Low        | Acceptable for playground |
| **Multi-row INSERT**     | 1               | Bulk INSERT        | Medium     | 60-100x faster            |
| **R2DBC Batch API**      | 100 (pipelined) | Individual INSERTs | High       | 10-20x faster             |

---

### When to Optimize

**Keep Sequential Approach (Current) When:**

- ✅ Validating sync architecture (playground/POC)
- ✅ Batch sizes are small (< 50 items)
- ✅ Simplicity is priority
- ✅ Targeting personal use (mobile module already uses single-transaction batching via expo-sqlite)

**Implement Batch Processing When:**

- ⚡ Handling large sync batches (100+ items regularly)
- ⚡ Network latency is critical
- ⚡ Production performance profiling shows sync bottleneck
- ⚡ Database is consistently PostgreSQL/MySQL

> **Mobile note (`expo-sqlite`).** The mobile module uses `expo-sqlite` with `withTransactionAsync` blocks
> instead of Room. Batching the projector's UPSERTs in a single transaction is already enough on mobile,
> because: (a) the SQLite database is local (no network round trip per statement); (b) a typical sync
> batch is small (≤ 100 events for a personal expense tracker); (c) `RemoteEventApplier` already runs
> the whole batch inside one `db.withTransactionAsync` call. The same multi-row VALUES technique
> described above translates directly to expo-sqlite if profiling ever shows the per-statement loop is
> a bottleneck on a constrained device — but it has not been needed in practice.

---

### PostgreSQL-Specific Optimization (Most Efficient)

If your production system uses **PostgreSQL exclusively**, you can leverage the `unnest()` function for the **most
efficient** batch processing.

#### Why PostgreSQL `unnest()` is Better

**Comparison:**

- **Multi-row VALUES**: Generates long SQL with many placeholders - `(?, ?, ...), (?, ?, ...), (?, ?, ...)`
- **PostgreSQL unnest()**: Uses arrays - `unnest(ARRAY[?, ?])` - more efficient for PostgreSQL query planner

**Performance benefits:**

- ✅ More compact SQL (shorter query string)
- ✅ Better query plan optimization by PostgreSQL
- ✅ Potentially faster execution for large batches (1000+ items)

#### Implementation with unnest()

```kotlin
@Component
class PostgresExpenseProjectionRepositoryImpl(
    private val databaseClient: DatabaseClient
) : ExpenseProjectionRepositoryCustom {

    /**
     * PostgreSQL-optimized batch projection using unnest()
     * 
     * Uses PostgreSQL arrays and unnest() function for optimal performance.
     * This is the most efficient approach for PostgreSQL.
     */
    @Transactional
    override suspend fun projectFromEventBatch(projections: List<ExpenseProjection>): Int {
        if (projections.isEmpty()) return 0

        val sql = """
            INSERT INTO expense_projections (id, description, amount, category, date, updated_at, deleted)
            SELECT 
                unnest(CAST(:ids AS text[])),
                unnest(CAST(:descriptions AS text[])),
                unnest(CAST(:amounts AS bigint[])),
                unnest(CAST(:categories AS text[])),
                unnest(CAST(:dates AS text[])),
                unnest(CAST(:updatedAts AS bigint[])),
                unnest(CAST(:deletedFlags AS boolean[]))
            ON CONFLICT (id) DO UPDATE SET
                description = EXCLUDED.description,
                amount = EXCLUDED.amount,
                category = EXCLUDED.category,
                date = EXCLUDED.date,
                updated_at = EXCLUDED.updated_at,
                deleted = EXCLUDED.deleted
            WHERE EXCLUDED.updated_at > expense_projections.updated_at
        """.trimIndent()

        val spec = databaseClient.sql(sql)
            .bind("ids", projections.map { it.id.toString() }.toTypedArray())  // Manual UUID->String
            .bind("descriptions", projections.map { it.description }.toTypedArray())
            .bind("amounts", projections.map { it.amount }.toTypedArray())
            .bind("categories", projections.map { it.category }.toTypedArray())
            .bind("dates", projections.map { it.date }.toTypedArray())
            .bind("updatedAts", projections.map { it.updatedAt }.toTypedArray())
            .bind("deletedFlags", projections.map { it.deleted }.toTypedArray())

        return spec.fetch().rowsUpdated().awaitSingle().toInt()
    }

    /**
     * PostgreSQL-optimized batch delete using unnest()
     */
    @Transactional
    override suspend fun markAsDeletedBatch(ids: List<UUID>, updatedAts: List<Long>): Int {
        if (ids.isEmpty()) return 0
        require(ids.size == updatedAts.size) { "ids and updatedAts must have the same size" }

        val sql = """
            UPDATE expense_projections 
            SET deleted = true, updated_at = updates.updated_at
            FROM (
                SELECT 
                    unnest(CAST(:ids AS text[])) as id,
                    unnest(CAST(:updatedAts AS bigint[])) as updated_at
            ) AS updates
            WHERE expense_projections.id = updates.id 
              AND expense_projections.updated_at < updates.updated_at
        """.trimIndent()

        val spec = databaseClient.sql(sql)
            .bind("ids", ids.map { it.toString() }.toTypedArray())
            .bind("updatedAts", updatedAts.toTypedArray())

        return spec.fetch().rowsUpdated().awaitSingle().toInt()
    }
}
```

#### Pros and Cons

**PostgreSQL unnest() Approach:**

- ✅ **Most efficient** for PostgreSQL (best query planning)
- ✅ **Cleanest code** - No manual parameter indexing, named parameters
- ✅ **Shorter SQL** - More compact than multi-row VALUES
- ✅ **Best for large batches** (1000+ items)
- ❌ **PostgreSQL only** - Not portable to SQLite/MySQL
- ⚠️ **Requires arrays** - Need to convert lists to arrays

**Multi-row VALUES Approach (Option 1):**

- ✅ **Portable** - Works on PostgreSQL, SQLite 3.24+, MySQL, H2
- ✅ **Standard SQL** - No database-specific features
- ⚠️ **More code** - Manual parameter indexing required
- ⚠️ **Longer SQL** - Many placeholders for large batches

**Recommendation:**

- Use **PostgreSQL unnest()** if you're committed to PostgreSQL in production
- Use **multi-row VALUES** if you need portability or plan to migrate to SQLite/Android

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

**Common Issues:**

- Docker not running: Start Docker Desktop
- Port conflicts: Stop other services using port 5432
- Testcontainers timeout: Increase Docker memory allocation

### Sync Not Working

**Check sync file:**

```bash
ls -la sync-data/
cat sync-data/sync.json
```

**Verify sync configuration:**

```bash
# Check application.yaml for sync settings
cat expenses-tracker-api/src/main/resources/application.yaml
```

**Check logs:**

```bash
docker logs expenses-api | grep -i sync
# Or in Windows PowerShell:
docker logs expenses-api | Select-String -Pattern "sync" -CaseSensitive:$false
```

### Transaction Issues

**Verify @Transactional working:**

- Check `ExpenseSyncProjector` and `ExpenseSyncRecorder` are separate components
- Verify injection (not `this.method()` calls)
- Look for rollback in logs
- Ensure R2DBC connection pooling is configured correctly

### Connection Issues

**Database connection errors:**

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
docker exec expenses-db psql -U postgres -d expenses_db -c "SELECT 1;"
```

**PostgreSQL major version upgrade (e.g. 16 → 17):**

If the container keeps restarting with `database files are incompatible with server`, the existing
Docker volume was initialized by the previous PostgreSQL version. PostgreSQL does not support
in-place major version data directory upgrades. Delete the volume and let the new version
re-initialize:

```bash
docker compose down -v      # stops containers AND removes volumes
docker compose up -d postgres
```

> ⚠️ This deletes all data in the local database. For a playground project this is fine —
> Flyway will recreate the schema on the next application start.

---

## 📚 Related Documentation

- [**Root README**](../README.md) — Project pitch, **Sync Engine Architecture (event sourcing, CQRS,
  conflict resolution, sync workflow)**, **Communication Flow (PKCE auth diagram)**, **Why This
  Architecture / Technical Decisions**, Docker Compose runbook, CI/CD, References.
- [**Frontend README**](../expenses-tracker-frontend/README.md) — Web frontend (React 19 + MUI v7).
- [**Mobile README**](../expenses-tracker-mobile/README.md) — Native mobile app (Expo / React Native)
  with offline-first SQLite store and cloud-drive sync.
- [**`.github/instructions/expenses-tracker-api.instructions.md`**](../.github/instructions/expenses-tracker-api.instructions.md)
  — Path-scoped Copilot rules (Kotlin style, Spring conventions, R2DBC patterns).
- [**`.github/instructions/test-conventions.instructions.md`**](../.github/instructions/test-conventions.instructions.md)
  — Path-scoped Copilot rules for backend tests.
- [**`AGENTS.md`**](../AGENTS.md) — Agent-targeted quick-reference for all modules.
