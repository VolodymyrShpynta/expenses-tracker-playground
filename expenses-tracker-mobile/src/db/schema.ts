/**
 * SQLite schema for the mobile event-sourcing core.
 *
 * Loose port of `expenses-tracker-api/src/main/resources/db/migration/V1__Initial_schema.sql`,
 * narrowed to the four tables the mobile module owns end-to-end:
 *   - `expense_events`      — append-only expense event log (source of truth)
 *   - `expense_projections` — query-optimized expense read model (last-write-wins)
 *   - `category_events`     — append-only category event log (mobile-only;
 *                             backend mutates `categories` directly)
 *   - `processed_events`    — idempotency registry for cross-device sync
 *                             (shared by both expense and category events;
 *                             event ids are globally-unique UUIDs)
 *
 * Plus `categories` — user-configurable categories.
 *
 * The schema deliberately omits the backend's `user_id` column. The mobile
 * SQLite database is private to a single install and serves exactly one
 * human user, so multi-tenant scoping has no meaning here and merely
 * fragmented sync (a fresh install ended up under a different per-device
 * UUID and could not see events imported from another device).
 *
 * Conventions (preserved from backend):
 *   - UUIDs stored as TEXT (was `VARCHAR(36)` on Postgres). SQLite has no
 *     native UUID type, so TEXT is the cross-platform choice.
 *   - Money amounts are stored in cents as INTEGER (BIGINT on Postgres).
 *   - Timestamps are epoch milliseconds (INTEGER) — projections compare
 *     them directly for last-write-wins conflict resolution.
 *   - Soft delete via `deleted` (0/1; SQLite has no native BOOLEAN).
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
        deleted     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_expense_projections_updated_at
        ON expense_projections(updated_at);
      CREATE INDEX IF NOT EXISTS idx_expense_projections_deleted
        ON expense_projections(deleted);
      CREATE INDEX IF NOT EXISTS idx_expense_projections_category_id
        ON expense_projections(category_id);

      CREATE TABLE IF NOT EXISTS expense_events (
        event_id   TEXT PRIMARY KEY,
        timestamp  INTEGER NOT NULL,
        event_type TEXT    NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'DELETED')),
        expense_id TEXT    NOT NULL,
        payload    TEXT    NOT NULL,
        committed  INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_expense_events_committed
        ON expense_events(committed);
      CREATE INDEX IF NOT EXISTS idx_expense_events_timestamp
        ON expense_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_expense_events_expense_id
        ON expense_events(expense_id);

      CREATE TABLE IF NOT EXISTS category_events (
        event_id    TEXT PRIMARY KEY,
        timestamp   INTEGER NOT NULL,
        event_type  TEXT    NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'DELETED')),
        category_id TEXT    NOT NULL,
        payload     TEXT    NOT NULL,
        committed   INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_category_events_committed
        ON category_events(committed);
      CREATE INDEX IF NOT EXISTS idx_category_events_timestamp
        ON category_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_category_events_category_id
        ON category_events(category_id);

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
        CHECK (name IS NOT NULL OR template_key IS NOT NULL)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name
        ON categories(name)
        WHERE deleted = 0 AND name IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_template
        ON categories(template_key)
        WHERE deleted = 0 AND template_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_categories_deleted
        ON categories(deleted);
      CREATE INDEX IF NOT EXISTS idx_categories_sort_order
        ON categories(sort_order);
    `,
  },
  {
    version: 2,
    sql: `
      -- Historical exchange-rate cache.
      --
      -- One row per (base, quote, period_start) tuple. period_start is the
      -- first day of the month the rate applies to ('YYYY-MM-01'), with the
      -- sentinel value 'LATEST' reserved for the most recent live rate
      -- (used as a fallback when no historical rate is available for the
      -- expense's month).
      --
      -- Rate convention follows Frankfurter / open.er-api.com: the value
      -- is 'how many quote units one base unit buys', i.e. to convert
      -- amount from quote to base divide by rate.
      CREATE TABLE IF NOT EXISTS exchange_rates (
        base         TEXT    NOT NULL,
        quote        TEXT    NOT NULL,
        period_start TEXT    NOT NULL,
        rate         REAL    NOT NULL,
        fetched_at   INTEGER NOT NULL,
        PRIMARY KEY (base, quote, period_start)
      );
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_base_period
        ON exchange_rates(base, period_start);
    `,
  },
];

/** SQLite database name on disk (lives under `FileSystem.documentDirectory/SQLite/`). */
export const DB_NAME = 'expenses.db';
