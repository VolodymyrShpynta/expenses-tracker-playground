/**
 * Internal batching helper shared by `remoteEventApplier` and
 * `remoteCategoryEventApplier`.
 *
 * Why batching matters on mobile: `expo-sqlite` calls go through the JS
 * bridge. The naive one-transaction-per-event design used in the backend
 * port did ~6 bridge hops per event (`isEventProcessed` pre-check, BEGIN,
 * `isEventProcessed` re-check, projection write, `recordProcessedEvent`,
 * COMMIT). At 4,500 events that is ~27,000 hops — minutes of pure overhead.
 *
 * What this helper changes:
 *   1. **Bulk dedup pre-load.** A single `findAllProcessedEventIds()` call
 *      hydrates an in-memory `Set`, replacing N point queries.
 *   2. **Per-chunk transactions.** ~200 events share one BEGIN/COMMIT.
 *   3. **Fallback to per-event isolation on chunk failure.** Preserves the
 *      backend's "one bad event must not abort the rest" guarantee — we
 *      retry only the failing chunk one event at a time.
 *   4. **Yield to the UI thread between chunks.** Prevents the sync dialog
 *      from freezing during long apply loops.
 *
 * Public `ApplyResult` semantics are unchanged.
 */
import type { LocalStore } from '../domain/localStore';

export interface ApplyResult {
  /** Events newly applied (excludes already-processed and errored). */
  readonly applied: number;
  /** Events skipped because already in `processed_events`. */
  readonly skipped: number;
  /** Events that threw during apply. Callers may surface a banner. */
  readonly errors: number;
}

export interface BatchApplyLog {
  warn: (msg: string, ...args: unknown[]) => void;
}

/**
 * Max events per transaction. ~200 balances commit-overhead amortization
 * against the cost of re-doing a whole chunk when a single event throws.
 */
const CHUNK_SIZE = 200;

/**
 * Apply a stream of events using batched transactions with per-chunk
 * fallback isolation.
 *
 * `getEventId` extracts the idempotency key from an event.
 * `applyOne` performs the projection step for a single event WITHIN the
 *   ambient transaction; it must not open its own transaction and must
 *   not write to `processed_events` (that is handled here).
 * `errorLabel` is prepended to per-event error logs (e.g. "remote event").
 */
export async function applyEventsBatched<TEvent>(
  store: LocalStore,
  events: ReadonlyArray<TEvent>,
  getEventId: (event: TEvent) => string,
  applyOne: (event: TEvent) => Promise<void>,
  errorLabel: string,
  log: BatchApplyLog,
): Promise<ApplyResult> {
  if (events.length === 0) return { applied: 0, skipped: 0, errors: 0 };

  // Hydrate the dedup set once. The set is mutated in place as we apply
  // so consecutive chunks see the latest state.
  const seen = new Set<string>(await store.findAllProcessedEventIds());
  const { pending, skipped } = partitionUnseen(events, getEventId, seen);

  let applied = 0;
  let errors = 0;

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE);

    try {
      await applyChunkAtomically(store, chunk, getEventId, applyOne);
      applied += chunk.length;
      markSeen(chunk, getEventId, seen);
    } catch (chunkError) {
      // The chunk transaction rolled back — none of its events landed.
      // Retry one-by-one so a single bad event is isolated while the rest
      // still go through.
      log.warn(
        `Chunk apply failed (${chunk.length} events) — retrying per-event`,
        chunkError,
      );
      const fallback = await applyChunkPerEvent(
        store,
        chunk,
        getEventId,
        applyOne,
        errorLabel,
        log,
        seen,
      );
      applied += fallback.applied;
      errors += fallback.errors;
    }

    if (i + CHUNK_SIZE < pending.length) {
      await yieldToEventLoop();
    }
  }

  return { applied, skipped, errors };
}

/**
 * Split the input into events still needing work vs. events already in
 * the dedup set. Pre-filtering keeps chunks dense — without it a sync
 * after a stale full-resync would burn whole transactions just to
 * discover everything is already-processed.
 */
function partitionUnseen<TEvent>(
  events: ReadonlyArray<TEvent>,
  getEventId: (event: TEvent) => string,
  seen: ReadonlySet<string>,
): { pending: TEvent[]; skipped: number } {
  const pending: TEvent[] = [];
  let skipped = 0;
  for (const event of events) {
    if (seen.has(getEventId(event))) skipped += 1;
    else pending.push(event);
  }
  return { pending, skipped };
}

/** Record a chunk's event IDs as processed in the in-memory dedup set. */
function markSeen<TEvent>(
  chunk: ReadonlyArray<TEvent>,
  getEventId: (event: TEvent) => string,
  seen: Set<string>,
): void {
  for (const event of chunk) seen.add(getEventId(event));
}

/**
 * Fast path — apply every event in the chunk inside one transaction.
 *
 * Throws if any single event throws; the caller is responsible for
 * retrying per-event when that happens (`applyChunkPerEvent`).
 */
async function applyChunkAtomically<TEvent>(
  store: LocalStore,
  chunk: ReadonlyArray<TEvent>,
  getEventId: (event: TEvent) => string,
  applyOne: (event: TEvent) => Promise<void>,
): Promise<void> {
  await store.transaction(async () => {
    for (const event of chunk) {
      await applyOne(event);
      await store.recordProcessedEvent(getEventId(event));
    }
  });
}

/**
 * Slow fallback — re-apply a chunk one event at a time, each in its own
 * transaction. Preserves the per-event isolation guarantee from the
 * original non-batched implementation: a single bad event is logged and
 * counted as an error, the rest still go through.
 */
async function applyChunkPerEvent<TEvent>(
  store: LocalStore,
  chunk: ReadonlyArray<TEvent>,
  getEventId: (event: TEvent) => string,
  applyOne: (event: TEvent) => Promise<void>,
  errorLabel: string,
  log: BatchApplyLog,
  seen: Set<string>,
): Promise<{ applied: number; errors: number }> {
  let applied = 0;
  let errors = 0;
  for (const event of chunk) {
    const id = getEventId(event);
    try {
      await store.transaction(async () => {
        await applyOne(event);
        await store.recordProcessedEvent(id);
      });
      applied += 1;
      seen.add(id);
    } catch (e) {
      errors += 1;
      log.warn(`Failed to apply ${errorLabel} ${id}`, e);
    }
  }
  return { applied, errors };
}

/**
 * Yield to the JS event loop so React Native can render UI updates and
 * process touch events between chunks. `setTimeout(0)` actually yields;
 * `Promise.resolve()` only drains the microtask queue.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
