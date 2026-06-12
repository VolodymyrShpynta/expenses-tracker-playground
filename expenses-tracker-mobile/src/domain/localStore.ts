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
 *
 * ## Atomicity invariant (paired writes)
 *
 * Mutating methods are individually safe to call outside a transaction
 * (they autocommit), but several MUST be called together as a single
 * unit to keep the event store and the read-model projection in sync.
 * Always wrap these in `store.transaction(async (tx) => { ... })` and
 * use the `tx` argument for every call inside:
 *
 *   - `appendEvent` + `projectFromEvent` (or `markAsDeleted`)
 *   - `appendCategoryEvent` + `projectCategoryFromEvent` (or `softDeleteCategory`)
 *
 * Splitting either pair across separate transactions recreates the
 * consistency hazard the backend's `@Transactional` annotation on
 * `ExpenseCommandService` prevents. New write code belongs in
 * `src/domain/commands.ts` / `src/domain/categoryService.ts`; the
 * sync apply path in `src/sync/` is the only other legitimate caller.
 */
import type {
  Category,
  CategoryEvent,
  CoveredEvent,
  ExpenseEvent,
  ExpenseProjection,
} from './types';

/**
 * Row counts deleted by `pruneCommittedEvents` for each table, in the
 * same order the underlying transaction processes them. Useful for
 * logging and for asserting prune behaviour in tests.
 */
export interface PruneCommittedEventsResult {
  readonly expenseEvents: number;
  readonly categoryEvents: number;
  readonly processedEvents: number;
}

/**
 * Atomic transactional unit. Implementations MUST run the closure inside a
 * single underlying transaction (`BEGIN`/`COMMIT` for SQLite). The
 * command service relies on this to keep the event-store append and the
 * projection update atomic — same boundary as the backend's
 * `@Transactional` annotation on `ExpenseCommandService`.
 *
 * The closure receives a `tx`-bound `LocalStore` that MUST be used for
 * every operation inside the transaction. On the SQLite implementation
 * this is a proxy bound to the exclusive transaction connection opened
 * by `withExclusiveTransactionAsync`; mixing it with the outer `store`
 * would re-introduce the "cannot start a transaction within a
 * transaction" race the exclusive API exists to prevent.
 */
export type TransactionRunner = <T>(action: (tx: LocalStore) => Promise<T>) => Promise<T>;

export interface LocalStore {
  /** Run `action` inside a single transaction. */
  transaction: TransactionRunner;

  // -- expense_events -------------------------------------------------------

  /**
   * Append a new event to the event store.
   *
   * Paired-write: must run inside `store.transaction(...)` together with
   * the matching `projectFromEvent` / `markAsDeleted` call.
   */
  appendEvent(event: ExpenseEvent): Promise<void>;

  /** All uncommitted events, ordered by timestamp ASC. */
  findUncommittedEvents(): Promise<ReadonlyArray<ExpenseEvent>>;

  /**
   * All events (committed + uncommitted) still retained locally,
   * ordered by timestamp ASC.
   *
   * NOTE: this is NOT the full historical event log. Once an event has
   * been uploaded (`committed = 1`) and its `timestamp` falls outside
   * the snapshot retention window, `pruneCommittedEvents` removes it.
   * The projection still reflects that event — only the event row
   * itself is gone. Callers that need the full history should read the
   * uploaded sync file instead.
   */
  findAllEvents(): Promise<ReadonlyArray<ExpenseEvent>>;

  /** Mark events committed (called after successful sync upload). */
  markEventsCommitted(eventIds: ReadonlyArray<string>): Promise<void>;

  /**
   * Drop event-log rows whose contribution to the read model is no
   * longer needed locally:
   *
   *   - `expense_events`  where `committed = 1 AND timestamp < cutoff`
   *   - `category_events` where `committed = 1 AND timestamp < cutoff`
   *   - `processed_events` where `timestamp < cutoff`
   *
   * Safe because (a) the UI reads projections only, never re-derives
   * them from events, and (b) the same `cutoff` is used by
   * `snapshotBuilder` when populating `SyncFileSnapshot.coveredEvents`,
   * so deleted rows are guaranteed to be outside the snapshot’s
   * covered-events window. Uncommitted events are always preserved —
   * the `committed = 1` guard is the only signal that the cloud already
   * has them.
   *
   * The three deletes run inside a single transaction so an interrupted
   * call cannot leave one table pruned and the others not.
   *
   * Idempotent: re-running with the same or older `cutoff` is a no-op.
   */
  pruneCommittedEvents(cutoff: number): Promise<PruneCommittedEventsResult>;

  // -- expense_projections --------------------------------------------------

  /**
   * UPSERT the projection with last-write-wins.
   *
   * Returns the number of rows affected (`0` when the existing projection
   * has a strictly greater-or-equal `updatedAt`). Mirrors
   * `ExpenseProjectionRepository.projectFromEvent` — strict `>` comparison.
   *
   * Paired-write: must run inside `store.transaction(...)` together with
   * the matching `appendEvent` call.
   */
  projectFromEvent(projection: ExpenseProjection): Promise<number>;

  /**
   * Mark a projection as deleted only when `updatedAt` is strictly newer
   * than the stored value. Returns rows affected (`0` when no-op).
   *
   * NOTE: this method ONLY transitions to `deleted=true` — it never
   * resurrects. Use `projectFromEvent` with `deleted=false` and a newer
   * timestamp to resurrect.
   *
   * Paired-write: must run inside `store.transaction(...)` together with
   * the matching `appendEvent` call.
   */
  markAsDeleted(id: string, updatedAt: number): Promise<number>;

  /** Find a projection by id. Returns undefined if absent. */
  findProjectionById(id: string): Promise<ExpenseProjection | undefined>;

  /** Stream all active (non-deleted) projections. */
  findActiveProjections(): Promise<ReadonlyArray<ExpenseProjection>>;

  /**
   * All projections, including soft-deleted rows. Used by the snapshot
   * builder to capture the full read-model state, since a soft-deleted
   * row can still be superseded by a newer non-deleted update (LWW
   * resurrection).
   */
  findAllProjections(): Promise<ReadonlyArray<ExpenseProjection>>;

  // -- processed_events (idempotency registry) -----------------------------

  /** True if the given event was already processed during sync. */
  isEventProcessed(eventId: string): Promise<boolean>;

  /**
   * Snapshot of the entire idempotency registry, returned as
   * `{eventId, timestamp}` pairs. Used by:
   *
   *   - `applyEventsBatched` to seed an in-memory dedup `Set` (only the
   *     IDs are consulted) and spare thousands of `isEventProcessed`
   *     round-trips through the JS↔native bridge during batched apply.
   *   - `buildSnapshot` to populate `SyncFileSnapshot.coveredEvents`
   *     with the per-event timestamps required for retention-window
   *     pruning.
   */
  findAllProcessedEvents(): Promise<ReadonlyArray<CoveredEvent>>;

  /**
   * Mark an event as processed (idempotent — second insert is a no-op).
   * `timestamp` is the event's original emission time (the `timestamp`
   * field on `ExpenseEvent` / `CategoryEvent`), NOT the wall-clock time
   * we observed it — see `CoveredEvent` for why this matters.
   */
  recordProcessedEvent(eventId: string, timestamp: number): Promise<void>;

  // -- categories ----------------------------------------------------------

  /**
   * UPSERT a category with last-write-wins. Mirrors `projectFromEvent` but
   * targets the `categories` table. Returns the number of rows affected
   * (`0` when the existing category has a strictly greater-or-equal
   * `updatedAt`).
   *
   * Used by both the local command path (where the fresh `updatedAt`
   * trivially wins) and the remote-apply path (where LWW resolves
   * cross-device conflicts).
   *
   * Paired-write: must run inside `store.transaction(...)` together with
   * the matching `appendCategoryEvent` call.
   */
  projectCategoryFromEvent(category: Category): Promise<number>;

  /** Find a single category by id. */
  findCategoryById(id: string): Promise<Category | undefined>;

  /**
   * All categories — including soft-deleted rows. The `useCategoryLookup`
   * hook needs the full catalog so historic expenses keep their display
   * fields after a category is archived.
   */
  findAllCategories(): Promise<ReadonlyArray<Category>>;

  /**
   * Soft-delete a category only when `updatedAt` is strictly newer than
   * the stored value. Mirrors `markAsDeleted` for expenses — only
   * transitions to deleted, never resurrects.
   *
   * Paired-write: must run inside `store.transaction(...)` together with
   * the matching `appendCategoryEvent` call.
   */
  softDeleteCategory(id: string, updatedAt: number): Promise<number>;

  // -- category_events -----------------------------------------------------

  /**
   * Append a new category event to the event store.
   *
   * Paired-write: must run inside `store.transaction(...)` together with
   * the matching `projectCategoryFromEvent` / `softDeleteCategory` call.
   */
  appendCategoryEvent(event: CategoryEvent): Promise<void>;

  /** All uncommitted category events, ordered by timestamp ASC. */
  findUncommittedCategoryEvents(): Promise<ReadonlyArray<CategoryEvent>>;

  /**
   * All category events (committed + uncommitted) still retained
   * locally, ordered by timestamp ASC.
   *
   * Same retention caveat as `findAllEvents` — `pruneCommittedEvents`
   * trims committed rows whose `timestamp` falls outside the snapshot
   * retention window. Projections reflect those events; the event rows
   * themselves are gone.
   */
  findAllCategoryEvents(): Promise<ReadonlyArray<CategoryEvent>>;

  /** Mark category events committed (called after successful sync upload). */
  markCategoryEventsCommitted(eventIds: ReadonlyArray<string>): Promise<void>;
}
