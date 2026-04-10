---
applyTo: "expenses-tracker-api/src/test/**"
---

# Test Conventions — Expenses Tracker API

These rules apply when working on test files under `expenses-tracker-api/src/test/`.

---

## Test infrastructure

- All integration tests use **Testcontainers PostgreSQL** — Docker must be running.
- Import `TestContainersConfig` with `@Import(TestContainersConfig::class)` and activate the test profile with `@ActiveProfiles("test")`.
- The test profile uses `application-test.yaml` which disables gzip compression and writes sync files to `./build/test-sync-data/`.
- Use `@SpringBootTest(webEnvironment = RANDOM_PORT)` for controller/HTTP tests that need a running server.
- Use `@SpringBootTest` (default, no web environment) for service/repository integration tests.
- Use `WebTestClient` for HTTP assertions (configure via `WebTestClientConfig`).
- Testcontainers uses `@ServiceConnection` to auto-wire R2DBC and JDBC connection properties — no `@DynamicPropertySource` needed.

## Unit tests (service, mapper, DTO)

- Use `@ExtendWith(MockitoExtension::class)` + `@Mock` + `mockito-kotlin`.
- Use AssertJ assertions (`assertThat(...)`, `assertThatThrownBy { ... }`).

## Manual DB cleanup (not `@Transactional` rollback)

Reactive R2DBC tests **cannot** rely on Spring's `@Transactional` test rollback because the test thread and the reactive execution happen on different threads. Every test must clean up manually in `@BeforeEach`:

```kotlin
@BeforeEach
fun setup() {
    runBlocking {
        databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
        databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
        databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
    }
}
```

Always delete in dependency order: `processed_events` → `expense_events` → `expense_projections`.

## Reset `ProcessedEventsCache` in sync tests

The in-memory `ProcessedEventsCache` persists across tests in the same Spring context. Call `processedEventsCache.reset()` in `@BeforeEach` for any test that exercises the sync/projection path, otherwise idempotency checks will produce false positives.

## Coroutines in tests

- Use `runTest` from `kotlinx-coroutines-test` for test bodies (handles virtual time).
- `runBlocking` is acceptable in `@BeforeEach`/`@AfterEach` and inside `assertThatThrownBy` blocks (AssertJ expects a `ThrowingCallable`).

## Mocking conventions

- Use `@MockitoSpyBean` (Spring Boot 4) — not `@MockBean` or `@SpyBean` (deprecated).
- Use `mockito-kotlin` helpers (`any()`, `doAnswer`, etc.).
- Reset spies with `Mockito.reset(spy)` when a single test needs different behavior across calls.

## Test naming

Use backtick descriptive names that state the scenario and expected outcome:

```kotlin
@Test
fun `should rollback both event and projection when projection fails`()
```

## Test structure

Follow **Given / When / Then** with comments:

```kotlin
// Given: An existing expense
val expense = createExpense(...)

// When: Deleting the expense
val result = commandService.deleteExpense(expense.id)

// Then: Projection should be soft-deleted
assertThat(result).isTrue()
```

## Sync file tests

- Tests write uncompressed JSON sync files directly (compression disabled in test profile).
- Clean up sync files in both `@BeforeEach` and `@AfterEach`.
- Use `ObjectMapper` to write `EventSyncFile` objects to the test sync path.
