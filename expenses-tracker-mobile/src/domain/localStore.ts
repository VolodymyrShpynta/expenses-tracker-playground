/**
 * Persistence-agnostic local store.
 *
 * Defined in `src/domain/` (not `src/db/`) so command/query/sync modules
 * depend on this interface, not on `expo-sqlite`. The production
 * implementation lives in `src/db/sqliteLocalStore.ts`; tests inject the
 * `InMemoryLocalStore` from `src/test/`.
 *
 * The interface deliberately mirrors the operations exposed by the
 * backend's `ExpenseEventRepository` + `ExpenseProjectionRepository`
 * pair — including the same last-write-wins UPSERT semantics.
 */
import type { Category, ExpenseEvent, ExpenseProjection } from './types';

/**
 * Atomic transactional unit. Implementations MUST run the closure inside a
 * single underlying transaction (`BEGIN`/`COMMIT` for SQLite). The
 * command service relies on this to keep the event-store append and the
 * projection update atomic — same boundary as the backend's
 * `@Transactional` annotation on `ExpenseCommandService`.
 */
export type TransactionRunner = <T>(action: () => Promise<T>) => Promise<T>;

export interface LocalStore {
  /** Run `action` inside a single transaction. */
  transaction: TransactionRunner;

  // -- expense_events -------------------------------------------------------

  /** Append a new event to the event store. */
  appendEvent(event: ExpenseEvent): Promise<void>;

  /** All uncommitted events for the user, ordered by timestamp ASC. */
  findUncommittedEvents(userId: string): Promise<ReadonlyArray<ExpenseEvent>>;

  /**
   * All events (committed + uncommitted) for the user, ordered by
   * timestamp ASC. Used by the export flow to materialise the full
   * history into a sync file the user can share or restore from.
   */
  findAllEvents(userId: string): Promise<ReadonlyArray<ExpenseEvent>>;

  /** Mark events committed (called after successful sync upload). */
  markEventsCommitted(eventIds: ReadonlyArray<string>): Promise<void>;

  // -- expense_projections --------------------------------------------------

  /**
   * UPSERT the projection with last-write-wins.
   *
   * Returns the number of rows affected (`0` when the existing projection
   * has a strictly greater-or-equal `updatedAt`). Mirrors
   * `ExpenseProjectionRepository.projectFromEvent` — strict `>` comparison.
   */
  projectFromEvent(projection: ExpenseProjection): Promise<number>;

  /**
   * Mark a projection as deleted only when `updatedAt` is strictly newer
   * than the stored value. Returns rows affected (`0` when no-op).
   *
   * NOTE: this method ONLY transitions to `deleted=true` — it never
   * resurrects. Use `projectFromEvent` with `deleted=false` and a newer
   * timestamp to resurrect.
   */
  markAsDeleted(id: string, updatedAt: number): Promise<number>;

  /** Find a projection by id within the user scope. Returns undefined if absent. */
  findProjectionById(id: string, userId: string): Promise<ExpenseProjection | undefined>;

  /** Stream all active (non-deleted) projections for the user. */
  findActiveProjections(userId: string): Promise<ReadonlyArray<ExpenseProjection>>;

  // -- processed_events (idempotency registry) -----------------------------

  /** True if the given event was already processed during sync. */
  isEventProcessed(eventId: string): Promise<boolean>;

  /** Mark an event as processed (idempotent — second insert is a no-op). */
  recordProcessedEvent(eventId: string): Promise<void>;

  // -- categories ----------------------------------------------------------

  /**
   * Insert or fully replace a category row. Used both for normal CRUD and
   * for first-launch seeding of default templates. No last-write-wins —
   * categories are not event-sourced.
   */
  upsertCategory(category: Category): Promise<void>;

  /** Find a single category by id within the user scope. */
  findCategoryById(id: string, userId: string): Promise<Category | undefined>;

  /**
   * All categories for the user — including soft-deleted rows. The
   * `useCategoryLookup` hook needs the full catalog so historic expenses
   * keep their display fields after a category is archived.
   */
  findAllCategories(userId: string): Promise<ReadonlyArray<Category>>;

  /** Soft-delete a category (mirrors the web frontend's `delete` semantics). */
  softDeleteCategory(id: string, userId: string, updatedAt: number): Promise<number>;
}
