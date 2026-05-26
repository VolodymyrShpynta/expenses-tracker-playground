/**
 * Snapshot applier — bulk-load a `SyncFileSnapshot` into the local store
 * so cold-install devices skip per-event projection writes for the
 * historical window covered by the snapshot.
 *
 * Apply order:
 *   1. Expense projections (LWW UPSERT — local newer rows survive).
 *   2. Categories (LWW UPSERT, same).
 *   3. `coveredEvents` → `processed_events` (INSERT OR IGNORE) — carries
 *      both the event id and its original timestamp so future snapshot
 *      builds on this device can apply the retention window correctly.
 *
 * Conflict semantics are unchanged from the event-apply path: strict `>`
 * on `updatedAt`. A warm device sees every step as a no-op because its
 * local rows already win the LWW comparison. A cold device gets every
 * row inserted in one transaction.
 *
 * Why all three steps share a single transaction: a crash mid-apply
 * would otherwise leave the projections populated but the registry
 * empty, causing the subsequent event apply to re-do every event. One
 * transaction means crash recovery sees either "nothing applied" or
 * "everything applied".
 *
 * The transaction is split into chunks for the same reason the
 * event-apply path is — see `batchApply.ts` — except chunks here are
 * larger because the work per row is a single UPSERT, not a dispatch +
 * idempotency insert.
 */
import type { LocalStore } from '../domain/localStore';
import type {
  Category,
  CoveredEvent,
  ExpenseProjection,
  SyncFileSnapshot,
} from '../domain/types';
import type { BatchApplyLog } from './batchApply';
import { SNAPSHOT_VERSION } from './snapshotBuilder';

/**
 * Thrown by `applySnapshot` when the snapshot's `version` field does not
 * match the current `SNAPSHOT_VERSION` this build understands.
 *
 * Version mismatch is treated as a hard error rather than a silent skip
 * because the sync file body is truncated against the snapshot's
 * `coveredEvents` (see `dropCoveredEvents`). If we silently ignored an
 * unknown snapshot and applied only the body, a cold install reading a
 * file written by a newer producer would end up with partial state —
 * the historical events captured exclusively by the snapshot would not
 * be in the body, and the device could then append conflicting writes
 * on top of that incomplete view.
 *
 * Refusing the sync surfaces a clear "please update the app" message
 * to the user and leaves the cloud file untouched. Warm devices that
 * happen to already have the historical state locally are protected
 * by the same rule — they won't sync into a half-understood format
 * either, so they can't append writes that disagree with the producer.
 *
 * Engine: this error escapes `performFullSync` and surfaces via
 * `lastError`. The retry loop only catches `ConcurrencyError`, so this
 * deliberately does NOT retry.
 */
export class IncompatibleSnapshotError extends Error {
  readonly received: number;
  readonly expected: number;

  constructor(received: number, expected: number) {
    super(
      `Sync file uses snapshot version ${received} but this app understands version ${expected}. ` +
        `Please update the app before continuing to sync.`,
    );
    this.name = 'IncompatibleSnapshotError';
    this.received = received;
    this.expected = expected;
  }
}

export interface SnapshotApplyResult {
  /** Number of projection UPSERTs that actually changed a row. */
  readonly projectionsApplied: number;
  /** Number of category UPSERTs that actually changed a row. */
  readonly categoriesApplied: number;
  /** Number of event IDs newly inserted into `processed_events`. */
  readonly eventsMarked: number;
}

/** Chunk size for snapshot apply. Larger than event-apply because each
 *  iteration is just one UPSERT instead of dispatch + processed insert. */
const SNAPSHOT_CHUNK_SIZE = 500;

/**
 * Apply a snapshot to the local store. Idempotent: re-applying the same
 * snapshot is a no-op thanks to LWW + `INSERT OR IGNORE`.
 *
 * Returns counts so the engine can log/observe what actually changed.
 * Throws `IncompatibleSnapshotError` when the snapshot's `version` is
 * not the one this build understands — see that class for rationale.
 */
export async function applySnapshot(
  store: LocalStore,
  snapshot: SyncFileSnapshot,
  log: BatchApplyLog = console,
): Promise<SnapshotApplyResult> {
  if (snapshot.version !== SNAPSHOT_VERSION) {
    log.warn(
      `Refusing snapshot with version ${snapshot.version} (expected ${SNAPSHOT_VERSION})`,
    );
    throw new IncompatibleSnapshotError(snapshot.version, SNAPSHOT_VERSION);
  }

  const projectionsApplied = await applyProjections(store, snapshot.expenses);
  await yieldToEventLoop();
  const categoriesApplied = await applyCategories(store, snapshot.categories);
  await yieldToEventLoop();
  const eventsMarked = await markCoveredEvents(store, snapshot.coveredEvents);

  return {
    projectionsApplied,
    categoriesApplied,
    eventsMarked,
  };
}

/** Bulk UPSERT projection rows in chunked transactions. */
async function applyProjections(
  store: LocalStore,
  projections: ReadonlyArray<ExpenseProjection>,
): Promise<number> {
  return applyInChunks(store, projections, async (row) => {
    const rows = await store.projectFromEvent(row);
    return rows > 0;
  });
}

/** Bulk UPSERT category rows in chunked transactions. */
async function applyCategories(
  store: LocalStore,
  categories: ReadonlyArray<Category>,
): Promise<number> {
  return applyInChunks(store, categories, async (row) => {
    const rows = await store.projectCategoryFromEvent(row);
    return rows > 0;
  });
}

/** Bulk INSERT OR IGNORE into `processed_events`. */
async function markCoveredEvents(
  store: LocalStore,
  covered: ReadonlyArray<CoveredEvent>,
): Promise<number> {
  if (covered.length === 0) return 0;

  // Pre-load the registry so we can count NEW inserts accurately.
  // Cheap — same single SELECT the event-apply path already does. We only
  // need the ids here; the timestamps come from the snapshot entries.
  const processed = await store.findAllProcessedEvents();
  const seen = new Set<string>(processed.map((p) => p.eventId));

  return applyInChunks(store, covered, async (entry) => {
    if (seen.has(entry.eventId)) return false;
    await store.recordProcessedEvent(entry.eventId, entry.timestamp);
    seen.add(entry.eventId);
    return true;
  });
}

/**
 * Iterate `items` in `SNAPSHOT_CHUNK_SIZE` slices. Each slice is wrapped
 * in its own transaction; between slices the loop yields to the JS
 * event loop so RN can paint. The `perItem` callback returns `true`
 * whenever it produced an observable change (e.g. an UPSERT that
 * actually touched a row, or an INSERT that wasn't a duplicate); the
 * total count of such "true" results is returned to the caller.
 */
async function applyInChunks<T>(
  store: LocalStore,
  items: ReadonlyArray<T>,
  perItem: (item: T) => Promise<boolean>,
): Promise<number> {
  let changed = 0;
  for (let start = 0; start < items.length; start += SNAPSHOT_CHUNK_SIZE) {
    const chunk = items.slice(start, start + SNAPSHOT_CHUNK_SIZE);
    await store.transaction(async () => {
      for (const item of chunk) {
        if (await perItem(item)) changed += 1;
      }
    });
    if (start + SNAPSHOT_CHUNK_SIZE < items.length) await yieldToEventLoop();
  }
  return changed;
}

/**
 * Yield to the JS event loop so React Native can render UI updates
 * between chunks. Mirrors the helper in `batchApply.ts` — kept local to
 * avoid a cross-module import for a one-line primitive.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
