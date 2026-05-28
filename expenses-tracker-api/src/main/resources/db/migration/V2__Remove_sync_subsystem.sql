-- =============================================================================
-- Migration V2: Remove the file-based sync subsystem.
-- =============================================================================
-- The backend no longer participates in cross-device sync. Web clients converge
-- via PostgreSQL directly, and any backup/migration use-case is covered by the
-- JSON / CSV import/export endpoints in `DataExchangeController` (`/api/export`
-- and `/api/import`). The mobile app keeps its own SQLite event store and
-- cloud-drive sync engine — it never depended on the backend's sync file.
--
-- Two schema artefacts existed solely to support the sync file mechanism and
-- are now dead weight:
--
--   * `expense_events.committed` (+ supporting index) — flagged events that
--     hadn't yet been uploaded to the shared sync file.
--   * `processed_events` table — idempotency registry for remote events
--     applied from the shared sync file.
--
-- Dropping them simplifies the write path and frees the backend from any
-- residual sync coupling.
-- =============================================================================

DROP INDEX IF EXISTS idx_expense_events_committed;
ALTER TABLE expense_events DROP COLUMN committed;
DROP TABLE IF EXISTS processed_events;
