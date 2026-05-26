/**
 * Pure-TypeScript domain types for the mobile event-sourcing core.
 *
 * Field names and JSON shape stay close to the backend's Kotlin domain
 * types (`expenses-tracker-api/src/main/kotlin/.../model/`), but the
 * mobile module deliberately omits the `userId` field that the backend
 * uses for multi-tenant scoping: a mobile install serves a single human
 * user, so the column would always be a constant and carrying it across
 * the sync file actively breaks cross-device sync (each device's
 * per-install UUID would not match the imported events').
 *
 * If you add a field here, mirror it on the Kotlin DTO when the change
 * affects the sync-file format. There is intentionally no shared
 * package — the JSON wire format is the single source of truth.
 */

/** Stable, language-independent slug shared with backend (`EventType.kt`). */
export const EVENT_TYPES = ['CREATED', 'UPDATED', 'DELETED'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Body of an expense event. Mirrors `ExpensePayload.kt` minus the
 * backend-only `userId` field. Optional fields use `?` (omitted from JSON
 * when undefined) to match `@JsonInclude(NON_NULL)` on the Kotlin side.
 */
export interface ExpensePayload {
  /** UUID, stored as a 36-char string for cross-platform portability. */
  readonly id: string;
  readonly description?: string;
  /** Cents (integer). */
  readonly amount?: number;
  /** ISO 4217 currency code. */
  readonly currency?: string;
  /** UUID of the referenced category. */
  readonly categoryId?: string;
  /** ISO 8601 string. */
  readonly date?: string;
  /** Epoch milliseconds — basis for last-write-wins. */
  readonly updatedAt: number;
  readonly deleted?: boolean;
}

/**
 * Read-model row in the local SQLite `expense_projections` table.
 * Mirrors `ExpenseProjection.kt`. All required fields are non-null at
 * the storage layer; nullable columns map to `undefined` here.
 */
export interface ExpenseProjection {
  readonly id: string;
  readonly description?: string;
  readonly amount: number;
  readonly currency: string;
  readonly categoryId?: string;
  readonly date?: string;
  readonly updatedAt: number;
  readonly deleted: boolean;
}

/**
 * Append-only event log row in the local SQLite `expense_events` table.
 * Mirrors `ExpenseEvent.kt`. Payload is stored as serialized JSON text
 * (verbatim wire shape of `ExpensePayload`).
 */
export interface ExpenseEvent {
  readonly eventId: string;
  readonly timestamp: number;
  readonly eventType: EventType;
  readonly expenseId: string;
  readonly payload: string;
  readonly committed: boolean;
}

/**
 * Event entry as it appears inside the sync file. Differs from
 * `ExpenseEvent` only in that the payload is parsed JSON (not a string).
 * Mirrors `EventEntry.kt`.
 */
export interface EventEntry {
  readonly eventId: string;
  readonly timestamp: number;
  readonly eventType: EventType;
  readonly expenseId: string;
  readonly payload: ExpensePayload;
}

/**
 * Sync file schema — the wire format shared between mobile devices via
 * the user's own cloud drive. Both `events` and `categoryEvents` are
 * required arrays (possibly empty); `snapshot` is the only truly
 * optional field. The codec normalizes malformed input to this shape.
 */
export interface EventSyncFile {
  readonly snapshot?: SyncFileSnapshot;
  readonly events: ReadonlyArray<EventEntry>;
  readonly categoryEvents: ReadonlyArray<CategoryEventEntry>;
}

/**
 * Materialized read-model snapshot embedded in the sync file. Lets
 * cold-install devices skip applying historical events one by one —
 * they bulk-load the projections + categories and bulk-mark the covered
 * event IDs as processed, then only events past the snapshot still need
 * the slow apply path.
 *
 * The snapshot is purely an optimization. Older readers that ignore the
 * field still rebuild correct state from `events` + `categoryEvents`.
 * Conflict semantics on apply are unchanged: LWW by `updatedAt`, soft
 * deletes can be superseded by newer non-deleted updates.
 *
 * Bump `version` and treat older snapshots as absent if the shape ever
 * changes incompatibly.
 */
export interface SyncFileSnapshot {
  /** Snapshot schema version. Current value: 2. */
  readonly version: number;
  /** Epoch ms when the snapshot was built. */
  readonly createdAt: number;
  /** Materialized expense projections, including soft-deleted rows. */
  readonly expenses: ReadonlyArray<ExpenseProjection>;
  /** Materialized categories, including soft-deleted rows. */
  readonly categories: ReadonlyArray<Category>;
  /**
   * Events whose effect is captured by this snapshot, paired with the
   * timestamp at which they were originally emitted. The pair (id +
   * timestamp) lets cold installs bulk-populate the local
   * `processed_events` registry with accurate per-event timestamps —
   * which in turn enables future snapshot builds on this device to
   * apply the same retention window without losing that information.
   *
   * Builders MAY prune entries older than `createdAt - PRUNE_WINDOW_MS`
   * (see `snapshotBuilder.ts`). Pruned entries are effectively
   * "trust the projections to reflect this era" — body events whose IDs
   * were pruned out of this set are no longer detectable as covered
   * and will be re-applied as no-ops by LWW on cold installs.
   */
  readonly coveredEvents: ReadonlyArray<CoveredEvent>;
}

/**
 * One entry in `SyncFileSnapshot.coveredEvents`. Carrying the original
 * event `timestamp` (not the snapshot build time) means receiving
 * devices can re-apply the same retention window when they later rebuild
 * the snapshot — without that, every cross-device hop would re-stamp
 * the IDs with a new "observed at" time and pruning would never
 * converge.
 */
export interface CoveredEvent {
  readonly eventId: string;
  /** Original event timestamp (epoch ms) — NOT the snapshot's build time. */
  readonly timestamp: number;
}

/**
 * User-configurable category.
 *
 * Categories are event-sourced on mobile (the backend mutates its own
 * `categories` table directly — but the backend has its own local-file
 * sync and never reads mobile's sync files, so there's no shared
 * contract to align with).
 */
export interface Category {
  readonly id: string;
  readonly name?: string;
  readonly templateKey?: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly updatedAt: number;
  readonly deleted: boolean;
}

/**
 * Body of a category event. Same field set as `Category` minus the
 * always-on `deleted` flag (defaults to `false` to match `ExpensePayload`).
 */
export interface CategoryPayload {
  readonly id: string;
  readonly name?: string;
  readonly templateKey?: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly updatedAt: number;
  readonly deleted?: boolean;
}

/**
 * Append-only event-log row in the local SQLite `category_events` table.
 * Payload is stored as serialized JSON text (verbatim wire shape of
 * `CategoryPayload`). Mirrors `ExpenseEvent`.
 */
export interface CategoryEvent {
  readonly eventId: string;
  readonly timestamp: number;
  readonly eventType: EventType;
  readonly categoryId: string;
  readonly payload: string;
  readonly committed: boolean;
}

/**
 * Category event entry as it appears inside the sync file. Differs from
 * `CategoryEvent` only in that the payload is parsed JSON (not a string).
 * Mirrors `EventEntry`.
 */
export interface CategoryEventEntry {
  readonly eventId: string;
  readonly timestamp: number;
  readonly eventType: EventType;
  readonly categoryId: string;
  readonly payload: CategoryPayload;
}
