# Expenses Tracker — Backend API <!-- omit in toc -->

A **Kotlin + Spring Boot 4 (WebFlux + Coroutines + R2DBC)** reactive REST API that implements
**event-sourced, CQRS-based** expense tracking with JSON / CSV import + export for backup and migration.

> **Where this module fits.** This module is the authoritative event store and projection layer for the
> web frontend ([`expenses-tracker-frontend`](../expenses-tracker-frontend/README.md)). Web clients converge
> through PostgreSQL directly — there is no backend-side file-sync subsystem. The mobile app
> ([`expenses-tracker-mobile`](../expenses-tracker-mobile/README.md)) is fully offline-first and does
> **not** depend on this backend at all; it has its own TypeScript sync engine that exchanges files
> through Google Drive / OneDrive. The canonical reference for that sync engine lives in the
> [mobile module README](../expenses-tracker-mobile/README.md).
>
> For the cross-cutting **event-sourcing model**, **CQRS rationale**, and **PKCE authentication flow**
> diagram, see the [root README](../README.md). This README focuses on running, configuring, testing,
> and tuning the backend itself.

---

## 📑 Table of Contents <!-- omit in toc -->

- [🎯 Overview](#-overview)
- [🛠 Tech Stack](#-tech-stack)
- [🚀 Running the Backend](#-running-the-backend)
  - [Prerequisites](#prerequisites)
  - [Start PostgreSQL and Keycloak](#start-postgresql-and-keycloak)
  - [Run the API server](#run-the-api-server)
  - [Building](#building)
- [⚙ Configuration](#-configuration)
  - [Environment Variables](#environment-variables)
  - [Application Configuration (`application.yaml`)](#application-configuration-applicationyaml)
- [🗄 Database Migrations (Flyway)](#-database-migrations-flyway)
- [📡 API Documentation](#-api-documentation)
  - [Endpoints](#endpoints)
  - [Quick API Test](#quick-api-test)
  - [HTTP Client Environment Configuration](#http-client-environment-configuration)
    - [File Location](#file-location)
    - [Configuration Format](#configuration-format)
    - [Available Environments](#available-environments)
    - [How to Use](#how-to-use)
    - [Customizing for Your Environment](#customizing-for-your-environment)
    - [Tips](#tips)
    - [Alternative: Using curl](#alternative-using-curl)
- [🧪 Testing](#-testing)
  - [Test Coverage](#test-coverage)
  - [Running Tests](#running-tests)
  - [Test Infrastructure](#test-infrastructure)
  - [Key Test Scenarios](#key-test-scenarios)
- [🚀 Performance Optimization: Batch Projection Writes](#-performance-optimization-batch-projection-writes)
  - [Today: Sequential Single-Row Writes](#today-sequential-single-row-writes)
  - [Possible Future Approach](#possible-future-approach)
    - [Option 1: Multi-Row INSERT (PostgreSQL + SQLite 3.24+)](#option-1-multi-row-insert-postgresql--sqlite-324)
    - [Option 2: Batch UPDATE with VALUES Clause](#option-2-batch-update-with-values-clause)
  - [Database Compatibility](#database-compatibility)
  - [Performance Comparison](#performance-comparison)
  - [When to Optimize](#when-to-optimize)
  - [PostgreSQL-Specific Variant (Most Efficient — Also Not Implemented)](#postgresql-specific-variant-most-efficient--also-not-implemented)
    - [Why PostgreSQL `unnest()` is Better](#why-postgresql-unnest-is-better)
    - [Implementation with unnest()](#implementation-with-unnest)
    - [Pros and Cons](#pros-and-cons)
- [📈 Scaling Notes \& Future Considerations](#-scaling-notes--future-considerations)
  - [Why this backend has no snapshots or compaction](#why-this-backend-has-no-snapshots-or-compaction)
  - [Operational scaling levers (apply only after measuring)](#operational-scaling-levers-apply-only-after-measuring)
- [🔍 Troubleshooting](#-troubleshooting)
  - [Tests Failing](#tests-failing)
  - [Transaction Issues](#transaction-issues)
  - [Connection Issues](#connection-issues)
- [📚 Related Documentation](#-related-documentation)

---

## 🎯 Overview

The backend is a reactive Spring Boot application that:

- Exposes a **REST API** at `/api/expenses` and `/api/categories`.
- Validates JWT Bearer tokens issued by **Keycloak** (resource-server mode, no session cookies).
- Persists events in `expense_events` (source of truth) and a materialized read model in
  `expense_projections` — both updated atomically in a single `@Transactional` boundary.
- Exposes JSON / CSV import + export endpoints (`/api/export`, `/api/import`) via
  `DataExchangeController` for backup and migration between deployments.
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
- **PostgreSQL 17** — single database for events, projections, and categories
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
```

> The runtime data path uses R2DBC (`spring.r2dbc.*`) while Flyway uses a **separate JDBC datasource**
> (`spring.flyway.datasource.*`). This is by design: Flyway has no reactive support and reactive code
> must not block on schema migrations.

---

## 🗄 Database Migrations (Flyway)

Migrations live under `src/main/resources/db/migration/`:

| File                                  | Type                                       | Purpose                                                 |
|---------------------------------------|--------------------------------------------|---------------------------------------------------------|
| `V1__Initial_schema.sql`              | Versioned (runs once, never modified)      | Creates the original schema (events, projections, categories, default templates). |
| `V2__Remove_sync_subsystem.sql`       | Versioned (runs once)                      | Drops the legacy `committed` column on `expense_events` and the `processed_events` table. |
| `R__Seed_default_categories.sql`      | Repeatable (re-runs when its hash changes) | Seeds language-agnostic default category templates.     |

The schema and the rationale behind each table are documented in detail in the
[**Backend Architecture — Database Schema** section of the root README](../README.md#database-schema).

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

2. **Controller Integration Tests** - `ExpensesControllerTest`
    - Full API endpoint integration
    - Request/response validation
    - CRUD operations end-to-end testing

3. **Repository Tests** - `ExpenseProjectionRepositoryTest`
    - UPSERT idempotency verification
    - Last-write-wins conflict resolution
    - Out-of-order operation handling
    - Soft delete behavior

4. **Data Exchange Tests** - `DataExchangeServiceTest`
    - JSON and CSV-in-ZIP export round-trips
    - Import re-creates events via the normal command path

### Running Tests

```bash
# Run all tests
./gradlew test

# Run with coverage report
./gradlew test jacocoTestReport

# Run specific test class
./gradlew test --tests ExpensesControllerTest
./gradlew test --tests ExpenseCommandServiceTransactionTest
./gradlew test --tests DataExchangeServiceTest

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
```

Many tests do **manual DB cleanup via `DatabaseClient` before each test** because reactive tests do not
rely on classic transactional test rollback semantics. The shared Testcontainers configuration is in
`src/test/kotlin/com/vshpynta/expenses/api/config/TestContainersConfig.kt`.

Path-scoped test conventions live in
[`.github/instructions/test-conventions.instructions.md`](../.github/instructions/test-conventions.instructions.md).

### Key Test Scenarios

**Last-Write-Wins (LWW) Projection:**

```kotlin
@Test
fun `should reject older event when newer projection exists`() = runBlocking {
    val expenseId = UUID.randomUUID()
    val newer = ExpenseProjection(id = expenseId, updatedAt = 2_000, ...)
    val older = ExpenseProjection(id = expenseId, updatedAt = 1_000, ...)

    projectionRepository.projectFromEvent(newer)
    val rowsAffected = projectionRepository.projectFromEvent(older)

    assertEquals(0, rowsAffected) // strict-greater-than guard rejects equal/older timestamps
}
```

**Transaction Rollback:**

```kotlin
@Test
fun `should rollback event when projection fails`() = runBlocking {
    val initialEvents = eventRepository.findAll().toList().size

    doAnswer { throw RuntimeException("Simulated projection failure") }
        .`when`(projectionRepository).projectFromEvent(any())

    assertThatThrownBy {
        runBlocking { commandService.createExpense(...) }
    }.isInstanceOf(RuntimeException::class.java)

    assertEquals(initialEvents, eventRepository.findAll().toList().size)
}
```

---

## 🚀 Performance Optimization: Batch Projection Writes

> **Status — design notes, not code.** Nothing in this section ships in the codebase today.
> There is no `projectFromEventBatch` method on `ExpenseProjectionRepository`, and there is no
> call site that would use one. The current write path is strictly single-row
> (`ExpenseCommandService` appends one event + UPSERTs one projection per command via
> `ExpenseProjectionRepository.projectFromEvent`, and `DataImporter` reuses the same per-row
> command path). This section is kept as a forward-looking design ledger so that when a real
> batched call site appears, the trade-offs have already been thought through. Read it together
> with [📈 Scaling Notes & Future Considerations](#-scaling-notes--future-considerations) —
> the same "only optimize after measuring" rule applies.

### Today: Sequential Single-Row Writes

Every command produces exactly one event and one projection UPSERT inside a single
`@Transactional` boundary:

```kotlin
// ExpenseProjectionRepository.kt — the only projection write method that exists today
suspend fun projectFromEvent(projection: ExpenseProjection): Int

// ExpenseCommandService.kt — one call per command
@Transactional
suspend fun createExpense(...): ExpenseProjection {
    eventRepository.save(event)
    projectionRepository.projectFromEvent(projection)  // single UPSERT, LWW-guarded
    return projection
}
```

**Why this is the right default for this codebase:**

- ✅ **Simple & Maintainable** — one code path for create / update / delete / import.
- ✅ **Atomic** — event append and projection UPSERT share one transaction.
- ✅ **Portable** — no database-specific SQL.
- ✅ **Adequate** — WebFlux + R2DBC already pipeline concurrent commands across the pool; there
  is no per-request batch to amortise.
- ⚠️ **N round trips per N commands** — would only matter if a batched call site existed.

---

### Possible Future Approach

*If* a genuine batched call site ever appears (e.g. a bulk-import endpoint that intentionally
bypasses the per-row command path), the patterns below are the ones to evaluate. They are
**not** in the codebase — treat them as a design sketch, not a target to implement now.

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

### PostgreSQL-Specific Variant (Most Efficient — Also Not Implemented)

If the future batched call site ever materialises and the deployment is committed to PostgreSQL,
the `unnest()` function gives the cleanest and best-performing variant. **Same status as above:
this is a design sketch, not code that exists in the repository.**

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

## 📈 Scaling Notes & Future Considerations

This section exists to **prevent two common over-engineering temptations** — bolting on event-sourcing
snapshots or an LSM-style compaction layer — and to record the operational levers that *do* make
sense, but only once measured pressure justifies them. The reasoning here is the mirror image of the
mobile module's
[**Design Alternatives Considered — Why Not Full LSM Compaction?**](../expenses-tracker-mobile/README.md#design-alternatives-considered--why-not-full-lsm-compaction)
section; the two modules face opposite constraints and therefore land on opposite designs.

### Why this backend has no snapshots or compaction

Classic event-sourcing snapshots exist to **avoid replaying N events to rehydrate an aggregate on the
read path.** This service never does that:

- `ExpenseCommandService` appends the event **and** UPSERTs the projection in the *same*
  `@Transactional` boundary.
- `ExpenseQueryService` reads **only** from `expense_projections`. It never touches
  `expense_events`.
- There is no `Expense.replay(events)` aggregate constructor anywhere in the codebase.

So **`expense_projections` already *is* the snapshot** — continuously maintained, LWW-merged,
indexed, and queryable in O(log n). Layering a second snapshot on top would be a snapshot of a
snapshot.

The same logic rules out an application-level LSM compaction layer. The mobile module needs one
because cloud-drive transport ships a whole-file blob and cold-install devices would otherwise
re-apply years of events. None of those constraints apply on the server:

| Pressure that motivates LSM on mobile     | Status on this backend                                |
|-------------------------------------------|-------------------------------------------------------|
| No per-row query API (whole-file blob)    | ✅ PostgreSQL queries individual rows                  |
| No cross-file atomic write                | ✅ MVCC + WAL provide it                               |
| Cold-install must replay all events       | ✅ Projections are always current — no replay         |
| Bandwidth-bound transport                 | ✅ Local TCP socket                                    |

PostgreSQL's heap + WAL + autovacuum already provide the storage-engine compaction that an
application-level LSM would otherwise have to reinvent — poorly.

### Operational scaling levers (apply only after measuring)

If real production telemetry ever shows pressure on this backend, the items below are the
proven, low-regret levers — in roughly the order they typically pay off. **Do not apply any of
them speculatively.** Each one adds operational surface area and only pays back against a
demonstrated bottleneck.

| Lever                                       | When it pays off                                                                | Cost / caveats                                                                   |
|---------------------------------------------|----------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| **Read replicas for projection queries**    | Read traffic dominates and the primary's CPU / WAL fsync is saturated.          | Async replication lag (typically <1 s) — acceptable here because reads are non-authoritative. |
| **Partition `expense_events` by year**      | The event table grows past tens of millions of rows *and* autovacuum / index bloat is measured. | Adds DDL complexity; cross-partition queries get more expensive. Only worth it once `pg_stat_user_tables` proves it. |
| **HASH partition by `user_id`**             | Per-user index bloat / autovacuum pressure shows up at high user counts, **or** as the prerequisite for future sharding (Citus etc.). | Use `PARTITION BY HASH (user_id)` with a fixed bucket count (16–256) — **never one partition per user** (PostgreSQL's catalog blows up at thousands of partitions). Bucket count is essentially permanent. Does *not* help GDPR delete (multiple users share a bucket) and does *not* give cheap time-based archival. |
| **Sharding (Citus / app-layer)**            | Single-instance CPU / RAM / WAL becomes the bottleneck and read replicas can't absorb it. | **PostgreSQL does not ship sharding.** Requires Citus (or app-level routing) and brings distributed-transaction caveats (2PC, cross-shard query coordinator, per-shard backups). The hash-partitioning step above is the prerequisite — Citus turns the same `PARTITION BY HASH (user_id)` definition into a distributed table via `create_distributed_table('expense_events', 'user_id')`. |
| **Cold-storage archival of old events**     | Compliance (GDPR right-to-erasure, retention windows) — *not* performance.       | The `expense_projections` row is the system of record for queries, so archival is mostly a legal/storage-cost lever. |
| **Outbox pattern**                          | A real downstream consumer appears (analytics warehouse, webhooks, search index). | Adds an `outbox` table + relay process; the single-transaction event append makes this a clean drop-in when needed. |

> **Partitioning vs. sharding — they are not the same.** Declarative partitioning splits one logical
> table across multiple physical sub-tables on the **same** PostgreSQL instance: same WAL, same
> autovacuum daemon, same CPU and RAM budget. It improves per-partition vacuum and keeps indexes
> smaller, but it does **not** give horizontal scale. Sharding spreads the data across **multiple**
> PostgreSQL instances and only ships as an extension (Citus) or as an external rewrite
> (CockroachDB, YugabyteDB). The reason hash partitioning by `user_id` is called out as a peer of
> time-based partitioning is that it doubles as the cheap, reversible pre-step that makes a future
> Citus migration mechanical instead of architectural.

A practical guardrail: **the smallest of these (read replicas) is a config + connection-routing
change, not an architecture change.** That ordering is deliberate — the cheaper levers also reverse
more cleanly if the measured bottleneck turns out to be somewhere else (a missing index, a chatty
client, an N+1 in a controller).

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

### Transaction Issues

**Verify @Transactional working:**

- `ExpenseCommandService` write methods carry `@Transactional` so the event append + projection upsert succeed or fail together.
- Never invoke transactional methods from inside the same class — calls must go through the Spring proxy.
- Look for rollback in logs.
- Ensure R2DBC connection pooling is configured correctly.

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

- [**Root README**](../README.md) — Project pitch, **Backend Architecture (event sourcing, CQRS,
  conflict resolution)**, **Communication Flow (PKCE auth diagram)**, **Why This Architecture /
  Technical Decisions**, Docker Compose runbook, CI/CD, References.
- [**Frontend README**](../expenses-tracker-frontend/README.md) — Web frontend (React 19 + MUI v7).
- [**Mobile README**](../expenses-tracker-mobile/README.md) — Native mobile app (Expo / React Native)
  with offline-first SQLite store and cloud-drive sync. **Canonical reference for the cross-device
  sync engine** (file format, conflict resolution, snapshot model, throttling).
- [**`.github/instructions/expenses-tracker-api.instructions.md`**](../.github/instructions/expenses-tracker-api.instructions.md)
  — Path-scoped Copilot rules (Kotlin style, Spring conventions, R2DBC patterns).
- [**`.github/instructions/test-conventions.instructions.md`**](../.github/instructions/test-conventions.instructions.md)
  — Path-scoped Copilot rules for backend tests.
- [**`AGENTS.md`**](../AGENTS.md) — Agent-targeted quick-reference for all modules.
