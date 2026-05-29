# AGENTS.md

> **Maintainer note:** Architecture sections here overlap with `.github/copilot-instructions.md`
> (which GitHub Copilot reads) and `.github/instructions/` (path-scoped Copilot rules).
> When updating architecture or conventions, update both places to avoid drift.

## Quick orientation
- Monorepo: backend in `expenses-tracker-api`, web frontend in `expenses-tracker-frontend/`, native app in `expenses-tracker-mobile/`.
- **Backend**: Kotlin + Spring Boot WebFlux + Coroutines + R2DBC, with PostgreSQL as the only persisted store.
- **Frontend**: React 19 + TypeScript + MUI v7 + TanStack Query + Vite. Consumes the backend REST API.
- **Mobile**: Expo + React Native + TypeScript + expo-sqlite. Fully offline-first with cloud-drive (Google Drive / OneDrive) sync that does NOT touch the backend. See `expenses-tracker-mobile/README.md` for the sync engine details.
- **Data-handling / GDPR posture lives in [`GDPR.md`](GDPR.md) at the repo root.** It is the single source of truth for what personal data is stored where, the data-subject-rights × module matrix, and the implementation guide for Art. 17 erasure (which is **not** implemented today). Module READMEs only cross-link to it; do not duplicate the matrix in module docs.
- Backend architecture is CQRS + event sourcing on two tables: `expense_events` is the append-only source of truth, `expense_projections` is the query model (`expenses-tracker-api/src/main/resources/db/migration/V1__Initial_schema.sql`, with `V2__Remove_sync_subsystem.sql` dropping the legacy `committed` column and `processed_events` table). The backend itself does NOT participate in cross-device sync — web clients converge through PostgreSQL directly, and backup / migration is handled by the JSON / CSV import-export endpoints in `DataExchangeController` (`/api/data/export` and `/api/data/import`).

## Runtime flow you should preserve
- Write path: HTTP -> `ExpensesController` -> `ExpenseCommandService` -> append event + project read model in one `@Transactional` boundary (`expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/service/ExpenseCommandService.kt`).
- Read path: `ExpenseQueryService` reads only projections and hides soft-deleted rows (`expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/service/ExpenseQueryService.kt`).
- Import / export path: `DataExchangeController` -> `DataExchangeService` -> `DataExporter` / `DataImporter`. Both JSON (lossless) and CSV-in-ZIP feed the same orchestrator; imports go through `ExpenseCommandService.createExpense()` so events and projections are produced exactly as for a normal write.

## Non-obvious project conventions
- UUIDs are stored as `VARCHAR(36)` (not DB UUID type) for portability; converter wiring is in `expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/config/R2dbcConfig.kt`.
- Conflict resolution is last-write-wins by timestamp; updates only apply when incoming `updated_at` is *strictly* newer (`ExpenseProjectionRepository.projectFromEvent`). Equal timestamps are rejected.
- Deletes are soft deletes (`deleted=true`) and can be superseded by newer non-deleted updates (resurrection is supported by timestamp ordering).
- Event payload is JSON text in `expense_events.payload`; mapping is centralized via `JsonOperations` and `ExpenseMapper`.
- **Mobile auto-sync.** On mobile, `SyncEngine.performFullSync()` is invoked from a single `AutoSyncCoordinator` (`expenses-tracker-mobile/src/sync/autoSyncCoordinator.ts`) that funnels every trigger — cold start, app foreground, after-write debounce (15 s quiet / 60 s ceiling), app-background flush, network reconnect, and the manual "Sync now" button. The coordinator enforces a single in-flight sync and a 30 s minimum gap between auto-syncs (the manual button passes `{ force: true }` to bypass). Mutation hooks notify via the module-level `notifyLocalWrite()` in `src/sync/autoSyncSignal.ts`. Never call `engine.performFullSync()` directly — go through `coordinator.requestSync(...)` or `coordinator.notifyLocalWrite()` so the throttle applies. Auto-sync triggers are user-controllable via a toggle in `SyncCloudDialog` (persisted under `expenses-tracker-sync-auto-enabled`); the manual button keeps working when auto-sync is off. See `.github/instructions/expenses-tracker-mobile.instructions.md` ("Automatic sync triggers") for the full table.
- **Always prefer modern APIs over deprecated ones.** MUI v7 uses `slotProps`/`slots` instead of legacy `*Props`/`*Component`/`componentsProps`. React 19 (`@types/react` v19) deprecates generic synthetic event types (`FormEvent`, `FormEventHandler`) — use specific types like `React.SubmitEvent<HTMLFormElement>` or let TypeScript infer from handler props. See `.github/instructions/expenses-tracker-frontend.instructions.md` for the full migration tables.
- **Frontend data fetching uses TanStack Query.** `src/api/` contains typed `fetch` wrappers; `src/hooks/` wraps them with `useQuery` / `useMutation`. Mutations auto-invalidate the `['expenses']` query key on success. Never use hand-rolled `useState`+`useEffect` for server state.

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
- Environment variables to know: `EXPENSES_TRACKER_R2DBC_*`, `EXPENSES_TRACKER_FLYWAY_*`, `KEYCLOAK_ISSUER_URI`, `KEYCLOAK_JWK_SET_URI`, `CORS_ALLOWED_ORIGINS`.
- Main API surface and examples are in `expenses-tracker-api.http` and controller tests (`ExpensesControllerTest`).
- Frontend consumes the REST API at `/api/expenses`. Amounts are in cents (integer). Dates are ISO 8601 strings.

## High-value references before editing
- Command/query boundaries: `ExpenseCommandService`, `ExpenseQueryService`, `ExpensesController`.
- Import / export: `DataExchangeController`, `DataExchangeService`, `DataExporter`, `DataImporter`, `DataExchangeCsvCodec`.
- Correctness specs are in tests: `ExpenseProjectionRepositoryTest`, `ExpenseCommandServiceTransactionTest`, `ExpensesControllerTest`, `DataExchangeServiceTest`.
