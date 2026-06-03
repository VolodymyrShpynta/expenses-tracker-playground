# Copilot Instructions — Expenses Tracker

> **Maintainer note:** Architecture sections here overlap with `AGENTS.md` in the repo root
> (which Claude Code and Codex CLI read). When updating architecture or conventions, update
> both places to avoid drift. Path-scoped rules live in `.github/instructions/`.

These instructions apply to every Copilot session in this workspace.
Backend-specific rules live in path-specific instruction files
under `.github/instructions/` and are merged automatically when editing matching files.

---

## Project Overview

**Expenses Tracker** is a full-stack expense tracking application with event sourcing and CQRS.

- **Monorepo** managed by Gradle with a version catalog (`gradle/libs.versions.toml`)
- **Backend** — Kotlin + Spring Boot 4 (WebFlux / R2DBC reactive stack)
- **Frontend** — React 19 + TypeScript + MUI v7 + TanStack Query + Vite (in `expenses-tracker-frontend/`)
- **Database** — PostgreSQL (R2DBC for app, JDBC for Flyway migrations)
- **Testing** — JUnit 5 / Testcontainers (backend)

### Key Commands

```bash
# Build everything
./gradlew build

# Backend only
./gradlew :expenses-tracker-api:build
./gradlew :expenses-tracker-api:bootRun

# Frontend (from expenses-tracker-frontend/)
npm run dev      # Vite dev server
npm run build    # Production build
npm run lint     # ESLint

# Run all tests (requires Docker for Testcontainers)
./gradlew test
```

---

## Architecture & Runtime Flows

Understanding these flows is critical before modifying any service code.

### CQRS + Event Sourcing (three tables)

| Table                 | Role                                      | Key detail                                                                                 |
|-----------------------|-------------------------------------------|--------------------------------------------------------------------------------------------|
| `expense_events`      | Append-only event store (source of truth) | Events are immutable                                                                       |
| `expense_projections` | Materialized read model                   | UPSERT with last-write-wins (`WHERE EXCLUDED.updated_at > expense_projections.updated_at`) |

Schema defined in `expenses-tracker-api/src/main/resources/db/migration/V1__Initial_schema.sql` (with `V2__Remove_sync_subsystem.sql` dropping the legacy `committed` column and `processed_events` table). Reference data (default category templates) is seeded by the repeatable migration `R__Seed_default_categories.sql`.

> **No backend sync subsystem.** The backend itself does not participate in cross-device sync. Web clients converge through PostgreSQL directly; backup / migration uses the JSON / CSV endpoints in `DataExchangeController` (`/api/data/export`, `/api/data/import`). The mobile app has its own independent TypeScript sync engine over Google Drive / OneDrive (see `expenses-tracker-mobile/README.md`).

### Write path (local commands)

```
HTTP → ExpensesController → ExpenseCommandService (@Transactional)
         ├─ append event to expense_events
         └─ project to expense_projections (UPSERT)
```

Both writes happen atomically. Never break this transactional boundary.

### Read path (queries)

```
HTTP → ExpensesController → ExpenseQueryService → expense_projections (WHERE deleted = false)
```

Reads only touch the projection table. Soft-deleted rows are hidden.

### Import / export path (backup & migration)

```
HTTP → DataExchangeController → DataExchangeService
         ├─ export → DataExporter   → JSON (lossless) or CSV-in-ZIP
         └─ import → DataImporter   → ExpenseCommandService.createExpense() per row
```

Imports flow through the normal command path so events and projections are produced exactly as for a regular write.

### Conflict resolution

- **Last-write-wins by timestamp** — applies uniformly to CREATED, UPDATED, DELETED events.
- Soft deletes (`deleted=true`) can be superseded by a newer non-deleted update (resurrection).
- Equal timestamps are rejected (strict `>`, not `>=`).

### Non-obvious conventions

- UUIDs stored as `VARCHAR(36)` for portability; R2DBC converters wired in `R2dbcConfig`.
- Event payload is JSON text in `expense_events.payload`; mapped via `JsonOperations` and `ExpenseMapper`.
- Flyway runs on a separate JDBC datasource (`spring.flyway.datasource.*`), not R2DBC.
- Jackson 2.x `ObjectMapper` bean is intentionally **not** `@Primary` — WebFlux uses Jackson 3.x; the bean exists for `JsonOperations` (used by `DataExporter`/`DataImporter`).
- **`testuser` has a pinned Keycloak `id` (`00000000-…-0000000000a`) in `keycloak/realm-export.json`** so `UserSub` in `http-client.env.json` (used by `/api/admin/users/{{UserSub}}/...` in `expenses-tracker-gdpr-api.http`) stays stable across realm re-imports. `adminuser` is not pinned. KC 26 ignores `id` on `POST /admin/realms/{r}/users`, so if `testuser` is erased mid-session either update `local.UserSub` to the new random UUID or `docker compose down -v && up -d` to re-import the realm.
- **`expenses-tracker-gdpr-api.http` tokens come from the SPA, not a password grant.** Destructive GDPR endpoints require the OIDC `auth_time` claim (enforced by `FreshAuthenticationService.requireFresh()`), which Keycloak emits only on the SPA's auth-code flow. Log in to the SPA, copy the bearer token from DevTools → Network → any `/api/...` request, paste into `local.UserToken` / `local.AdminToken`. The full workflow is in the `.http` file header.

### Environment variables

- `EXPENSES_TRACKER_R2DBC_URL`, `EXPENSES_TRACKER_R2DBC_USERNAME`, `EXPENSES_TRACKER_R2DBC_PASSWORD`
- `EXPENSES_TRACKER_FLYWAY_JDBC_URL`, `EXPENSES_TRACKER_FLYWAY_USERNAME`, `EXPENSES_TRACKER_FLYWAY_PASSWORD`
- `KEYCLOAK_ISSUER_URI`, `KEYCLOAK_JWK_SET_URI`, `CORS_ALLOWED_ORIGINS`

### Key files to read before editing

- **Command/query:** `ExpenseCommandService`, `ExpenseQueryService`, `ExpensesController`
- **Import / export:** `DataExchangeController`, `DataExchangeService`, `DataExporter`, `DataImporter`, `DataExchangeCsvCodec`
- **Correctness tests:** `ExpenseProjectionRepositoryTest`, `ExpenseCommandServiceTransactionTest`,
  `ExpensesControllerTest`, `DataExchangeServiceTest`

---

## Coding Style (project-specific emphasis)

These are not generic principles — they highlight areas where this codebase has specific expectations
that differ from defaults or are frequently violated.

- **Separation of concerns is enforced by package**: controllers (HTTP only, no logic) → services (business logic,
  `@Transactional`) → repositories (data access, `@Query`). All entity↔DTO mapping goes through `ExpenseMapper`.
- **Constructor injection only** — never `@Autowired` fields. Kotlin primary constructors make this natural.
- **Consistent vocabulary**: use `find` (not `get`/`retrieve`), `project` (not `apply`/`save`) for event→projection,
  `append` (not `add`/`insert`) for event store writes.
- **Logging**: declare in `companion object` with `LoggerFactory.getLogger(...)`. Use SLF4J placeholders (
  `logger.info("Created: {}", id)`), never string interpolation. Never log PII.
- **Comments explain "why", not "what"** — self-documenting code is the goal. Add comments for non-obvious architectural decisions.
- **Small functions (10–20 lines)**, guard clauses over nested `if`, max 2 levels of indentation.
- **Always check for errors after edits.** Prefer reading enough context before editing — don't guess file structure.
