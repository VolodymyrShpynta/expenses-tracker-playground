/**
 * Pure-TypeScript domain types for the mobile event-sourcing core.
 *
 * Field names and JSON shape are byte-identical to the backend's Kotlin
 * domain types (`expenses-tracker-api/src/main/kotlin/.../model/`). This is
 * NOT accidental — the on-disk `sync.json[.gz]` format is the contract that
 * lets the backend and any number of mobile devices converge through the
 * same Drive/OneDrive folder.
 *
 * If you rename a field here, you MUST rename the matching field in the
 * Kotlin DTO and bump the sync-file format. There is intentionally no
 * shared package — the JSON wire format is the single source of truth.
 */

/** Stable, language-independent slug shared with backend (`EventType.kt`). */
export const EVENT_TYPES = ['CREATED', 'UPDATED', 'DELETED'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Body of an expense event. Mirrors `ExpensePayload.kt` exactly.
 * Optional fields use `?` (omitted from JSON when undefined) to match
 * `@JsonInclude(NON_NULL)` on the Kotlin side.
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
  /** Keycloak `sub` claim on backend; cloud-account subject id on mobile. */
  readonly userId?: string;
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
  readonly userId: string;
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
  readonly userId: string;
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
  readonly userId?: string;
}

/** Sync file schema — mirrors `EventSyncFile.kt`. */
export interface EventSyncFile {
  readonly snapshot?: SyncFileSnapshot;
  readonly events: ReadonlyArray<EventEntry>;
}

export interface SyncFileSnapshot {
  readonly version: number;
  readonly expenses: ReadonlyArray<ExpensePayload>;
}

/**
 * User-configurable category. Mirrors `Category.kt`. Reference data only —
 * categories are NOT projected through the event store yet (kept consistent
 * with backend, where category mutations happen via direct SQL through
 * `CategoryService`).
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
  readonly userId: string;
}
