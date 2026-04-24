-- =============================================================================
-- Migration V1: Initial schema for the Expenses Tracker.
-- =============================================================================
-- Schema only — no reference data. The default-category templates live in the
-- repeatable migration `R__Seed_default_categories.sql` so they can evolve
-- (new languages, new templates, typo fixes) without piling up `V_` history.
--
-- Architecture: CQRS + event sourcing.
--   * expense_events       — append-only event log (source of truth)
--   * expense_projections  — query-optimized current state, last-write-wins
--   * processed_events     — idempotency registry for sync
--   * categories           — user-configurable categories (per user)
--   * default_categories   — read-only template seeded for new users
--                            (one row per logical category, language-agnostic;
--                            display names are translated on the frontend
--                            via the i18n `categoryTemplates.*` namespace)
--
-- Conventions:
--   * UUIDs are stored as VARCHAR(36) for portability (R2DBC converters wired
--     in R2dbcConfig).
--   * Money amounts are stored in cents as BIGINT.
--   * Timestamps are epoch milliseconds (BIGINT) — projections compare them
--     directly for last-write-wins conflict resolution.
--   * Soft delete via the `deleted` boolean. Active rows have deleted=false.
--   * Every user-scoped table has user_id (Keycloak `sub` claim).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- expense_projections — read model
-- -----------------------------------------------------------------------------
-- `category_id` references the `id` of a row in `categories` (UUID stored as
-- VARCHAR(36)). The column is intentionally NOT a foreign key: cross-device
-- sync may deliver an expense event before the corresponding category row has
-- been seeded locally, and we want the expense to land in the projection
-- regardless. Soft-deleted categories also remain referenceable for history.
-- The frontend is responsible for resolving id → (name, icon, color) at render
-- time, falling back to a placeholder for orphan ids.
CREATE TABLE expense_projections (
    id          VARCHAR(36) PRIMARY KEY,
    description VARCHAR(500),
    amount      BIGINT      NOT NULL,
    currency    VARCHAR(3)  NOT NULL DEFAULT 'USD',
    category_id VARCHAR(36),
    date        VARCHAR(50),
    updated_at  BIGINT      NOT NULL,
    deleted     BOOLEAN     NOT NULL DEFAULT false,
    user_id     VARCHAR(255) NOT NULL
);

CREATE INDEX idx_expense_projections_updated_at  ON expense_projections(updated_at);
CREATE INDEX idx_expense_projections_deleted     ON expense_projections(deleted);
CREATE INDEX idx_expense_projections_category_id ON expense_projections(category_id);
CREATE INDEX idx_expense_projections_user_id     ON expense_projections(user_id);


-- -----------------------------------------------------------------------------
-- expense_events — event store (immutable append-only log)
-- -----------------------------------------------------------------------------
CREATE TABLE expense_events (
    event_id   VARCHAR(36)  PRIMARY KEY,
    timestamp  BIGINT       NOT NULL,
    event_type VARCHAR(20)  NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'DELETED')),
    expense_id VARCHAR(36)  NOT NULL,
    payload    TEXT         NOT NULL,
    committed  BOOLEAN      NOT NULL DEFAULT false,
    user_id    VARCHAR(255) NOT NULL
);

CREATE INDEX idx_expense_events_committed  ON expense_events(committed);
CREATE INDEX idx_expense_events_timestamp  ON expense_events(timestamp);
CREATE INDEX idx_expense_events_expense_id ON expense_events(expense_id);
CREATE INDEX idx_expense_events_user_id    ON expense_events(user_id);


-- -----------------------------------------------------------------------------
-- processed_events — idempotency registry for cross-device sync
-- -----------------------------------------------------------------------------
CREATE TABLE processed_events (
    event_id VARCHAR(36) PRIMARY KEY
);


-- -----------------------------------------------------------------------------
-- default_categories — language-agnostic template table
-- -----------------------------------------------------------------------------
-- `template_key` is a stable, language-independent slug shared with user
-- categories that were seeded from this template (`categories.template_key`).
-- The frontend translates these slugs at display time via the
-- `categoryTemplates.*` i18n namespace, so no `language`/`name` columns are
-- stored here. The same template is reset/seed source for every locale.
CREATE TABLE default_categories (
    template_key VARCHAR(50)  PRIMARY KEY,
    icon         VARCHAR(50)  NOT NULL,
    color        VARCHAR(7)   NOT NULL,
    sort_order   INT          NOT NULL DEFAULT 0
);


-- -----------------------------------------------------------------------------
-- categories — user-configurable categories
-- -----------------------------------------------------------------------------
-- `template_key` links a row back to its template in `default_categories`.
-- NULL means the user created this category themselves (custom).
--
-- `name` is nullable: when `template_key` is set and `name` is NULL the
-- frontend renders the translated template name. A non-NULL `name` is a
-- user override (custom rename) and wins over the translation.
-- Custom user-created categories (template_key IS NULL) MUST have a name —
-- the CHECK constraint below enforces "at least one identifier".
CREATE TABLE categories (
    id           VARCHAR(36)  PRIMARY KEY,
    name         VARCHAR(100),
    template_key VARCHAR(50),
    icon         VARCHAR(50)  NOT NULL,
    color        VARCHAR(7)   NOT NULL,
    sort_order   INT          NOT NULL DEFAULT 0,
    updated_at   BIGINT       NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT false,
    user_id      VARCHAR(255) NOT NULL,
    CONSTRAINT chk_categories_name_or_template
        CHECK (name IS NOT NULL OR template_key IS NOT NULL)
);

-- Active custom names are unique per user (case-sensitive). Templated rows
-- with NULL name are excluded from this constraint.
CREATE UNIQUE INDEX idx_categories_name_user
    ON categories(user_id, name)
    WHERE deleted = false AND name IS NOT NULL;

-- One row per (user, template) — used as the ON CONFLICT target for the
-- idempotent "reset to defaults" upsert. Soft-deleted template rows are
-- included so reset can resurrect them in place.
CREATE UNIQUE INDEX idx_categories_user_template
    ON categories(user_id, template_key)
    WHERE template_key IS NOT NULL;

CREATE INDEX idx_categories_deleted    ON categories(deleted);
CREATE INDEX idx_categories_sort_order ON categories(sort_order);
CREATE INDEX idx_categories_user_id    ON categories(user_id);
