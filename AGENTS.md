# AGENTS.md

> **Maintainer note:** Architecture sections here overlap with `.github/copilot-instructions.md`
> (which GitHub Copilot reads) and `.github/instructions/` (path-scoped Copilot rules).
> When updating architecture or conventions, update both places to avoid drift.

## Quick orientation
- Monorepo: backend in `expenses-tracker-api`, frontend in `expenses-tracker-frontend/`.
- **Backend**: Kotlin + Spring Boot WebFlux + Coroutines + R2DBC, with PostgreSQL as the only persisted store.
- **Frontend**: React 19 + TypeScript + MUI v7 + Vite. Consumes the backend REST API.
- Architecture is CQRS + event sourcing: `expense_events` is source of truth, `expense_projections` is query model, `processed_events` is idempotency registry (`expenses-tracker-api/src/main/resources/db/migration/V1__Create_expenses_tables.sql`).

## Runtime flow you should preserve
- Write path: HTTP -> `ExpensesController` -> `ExpenseCommandService` -> append event + project read model in one `@Transactional` boundary (`expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/service/ExpenseCommandService.kt`).
- Read path: `ExpenseQueryService` reads only projections and hides soft-deleted rows (`expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/service/ExpenseQueryService.kt`).
- Sync path: `ExpenseEventSyncService` orchestrates file-based sync; it processes remote events first, then appends local uncommitted events (`expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/service/ExpenseEventSyncService.kt`).
- Remote apply path is split intentionally: `ExpenseSyncProjector` (idempotency/cache checks) -> `ExpenseSyncRecorder` (transactional DB writes). Keep this separation; it exists to avoid Spring self-invocation transaction pitfalls.

## Non-obvious project conventions
- UUIDs are stored as `VARCHAR(36)` (not DB UUID type) for portability; converter wiring is in `expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/config/R2dbcConfig.kt`.
- Conflict resolution is last-write-wins by timestamp; updates only apply when incoming `updated_at` is newer (`ExpenseProjectionRepository.projectFromEvent`).
- Deletes are soft deletes (`deleted=true`) and can be superseded by newer non-deleted updates (resurrection is supported by timestamp ordering).
- Event payload is JSON text in `expense_events.payload`; mapping is centralized via `JsonOperations` and `ExpenseMapper`.
- Sync file is optionally gzip-compressed and checksum-cached for change detection (`SyncFileManager`, `FileOperations`); default path is `./sync-data/sync.json` (+ `.gz` when compression enabled).
- **Always prefer modern APIs over deprecated ones.** MUI v7 uses `slotProps`/`slots` instead of legacy `*Props`/`*Component`/`componentsProps`. See `.github/instructions/expenses-tracker-frontend.instructions.md` for the full migration table.

## Build, run, test workflows
- Build all: `./gradlew build`.
- Build API only: `./gradlew :expenses-tracker-api:build`.
- Run API: `./gradlew :expenses-tracker-api:bootRun`.
- Frontend dev: `cd expenses-tracker-frontend && npm run dev`.
- Frontend build: `cd expenses-tracker-frontend && npm run build`.
- Tests use Testcontainers PostgreSQL and require Docker; base config is `expenses-tracker-api/src/test/kotlin/com/vshpynta/expenses/api/config/TestContainersConfig.kt`.
- Many tests do manual DB cleanup via `DatabaseClient` before each test because reactive tests do not rely on classic transactional test rollback semantics.

## Integration points and operational knobs
- Runtime DB uses R2DBC (`spring.r2dbc.*`), while Flyway uses a separate JDBC datasource (`spring.flyway.datasource.*`) in `expenses-tracker-api/src/main/resources/application.yaml`.
- Environment variables to know: `EXPENSES_TRACKER_R2DBC_*`, `EXPENSES_TRACKER_FLYWAY_*`, `SYNC_FILE_PATH`, `SYNC_FILE_COMPRESSION_ENABLED`.
- Main API surface and examples are in `expenses-tracker-api.http` and controller tests (`SyncExpenseControllerTest`).
- Frontend consumes the REST API at `/api/expenses`. Amounts are in cents (integer). Dates are ISO 8601 strings.

## High-value references before editing
- Command/query boundaries: `ExpenseCommandService`, `ExpenseQueryService`, `ExpensesController`.
- Sync internals: `ExpenseEventSyncService`, `SyncFileManager`, `RemoteEventProcessor`, `ExpenseSyncProjector`, `ExpenseSyncRecorder`.
- Correctness specs are in tests: `ExpenseProjectionRepositoryTest`, `ExpenseSyncProjectorTransactionTest`, `ExpenseEventSyncServiceTest`, `ExpenseCommandServiceTransactionTest`.
