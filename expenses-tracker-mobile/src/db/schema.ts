/**
 * SQLite schema for the mobile event-sourcing core.
 *
 * Direct port of `expenses-tracker-api/src/main/resources/db/migration/V1__Initial_schema.sql`,
 * narrowed to the three tables the mobile module owns end-to-end:
 *   - `expense_events`      — append-only event log (source of truth)
 *   - `expense_projections` — query-optimized read model (last-write-wins)
 *   - `processed_events`    — idempotency registry for cross-device sync
 *
 * Plus `categories` — user-configurable categories — same shape as backend.
 *
 * Conventions (preserved from backend):
 *   - UUIDs stored as TEXT (was `VARCHAR(36)` on Postgres). SQLite has no
 *     native UUID type, so TEXT is the cross-platform choice.
 *   - Money amounts are stored in cents as INTEGER (BIGINT on Postgres).
 *   - Timestamps are epoch milliseconds (INTEGER) — projections compare
 *     them directly for last-write-wins conflict resolution.
 *   - Soft delete via `deleted` (0/1; SQLite has no native BOOLEAN).
 *   - All user-scoped rows carry `user_id`.
 *
 * Reference data (`default_categories`, `categories` seeding) is handled
 * separately at app bootstrap time — mirrors the backend's
 * `R__Seed_default_categories.sql` repeatable migration.
 */

/**
 * Each entry is one numbered, idempotent migration. Apply in order; the
 * runner records `user_version` so re-runs are no-ops.
 *
 * NEVER edit a migration after release — add a new one. Same rule as Flyway.
 */
export const MIGRATIONS: ReadonlyArray<{ readonly version: number; readonly sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS expense_projections (
        id          TEXT PRIMARY KEY,
        description TEXT,
        amount      INTEGER NOT NULL,
        currency    TEXT    NOT NULL DEFAULT 'USD',
        category_id TEXT,
        date        TEXT,
        updated_at  INTEGER NOT NULL,
        deleted     INTEGER NOT NULL DEFAULT 0,
        user_id     TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expense_projections_updated_at
        ON expense_projections(updated_at);
      CREATE INDEX IF NOT EXISTS idx_expense_projections_deleted
        ON expense_projections(deleted);
      CREATE INDEX IF NOT EXISTS idx_expense_projections_category_id
        ON expense_projections(category_id);
      CREATE INDEX IF NOT EXISTS idx_expense_projections_user_id
        ON expense_projections(user_id);

      CREATE TABLE IF NOT EXISTS expense_events (
        event_id   TEXT PRIMARY KEY,
        timestamp  INTEGER NOT NULL,
        event_type TEXT    NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'DELETED')),
        expense_id TEXT    NOT NULL,
        payload    TEXT    NOT NULL,
        committed  INTEGER NOT NULL DEFAULT 0,
        user_id    TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expense_events_committed
        ON expense_events(committed);
      CREATE INDEX IF NOT EXISTS idx_expense_events_timestamp
        ON expense_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_expense_events_expense_id
        ON expense_events(expense_id);
      CREATE INDEX IF NOT EXISTS idx_expense_events_user_id
        ON expense_events(user_id);

      CREATE TABLE IF NOT EXISTS processed_events (
        event_id TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS categories (
        id           TEXT PRIMARY KEY,
        name         TEXT,
        template_key TEXT,
        icon         TEXT    NOT NULL,
        color        TEXT    NOT NULL,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        updated_at   INTEGER NOT NULL,
        deleted      INTEGER NOT NULL DEFAULT 0,
        user_id      TEXT    NOT NULL,
        CHECK (name IS NOT NULL OR template_key IS NOT NULL)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_user
        ON categories(user_id, name)
        WHERE deleted = 0 AND name IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_template
        ON categories(user_id, template_key)
        WHERE template_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_categories_deleted
        ON categories(deleted);
      CREATE INDEX IF NOT EXISTS idx_categories_sort_order
        ON categories(sort_order);
      CREATE INDEX IF NOT EXISTS idx_categories_user_id
        ON categories(user_id);
    `,
  },
];

/** SQLite database name on disk (lives under `FileSystem.documentDirectory/SQLite/`). */
export const DB_NAME = 'expenses.db';
