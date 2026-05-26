/**
 * Snapshot builder — read the local store's current state and produce a
 * `SyncFileSnapshot` for upload as part of the next sync cycle.
 *
 * The snapshot captures three things:
 *   1. Every projection row (active AND soft-deleted) — soft-deleted
 *      rows must be preserved so LWW resurrection still works on cold
 *      installs.
 *   2. Every category row (same reasoning, via `findAllCategories`).
 *   3. Events whose effect is materialized in (1) and (2), each paired
 *      with the event's original timestamp. The set is the union of the
 *      idempotency registry (`processed_events`, i.e. remote-origin
 *      events) and the local event-log tables (which contain events
 *      created by the local command path — those never land in
 *      `processed_events`).
 *
 *      Entries older than `createdAt - PRUNE_WINDOW_MS` are dropped —
 *      they are still reflected in (1) and (2), but their IDs no longer
 *      ride along on every upload. See `PRUNE_WINDOW_MS` for the
 *      trade-off.
 *
 * The builder is read-only — it does not mutate the store. Snapshot
 * upload is the engine's responsibility.
 *
 * Build cost is dominated by the three table scans. For 4,500 events on
 * mid-range Android this completes in well under a second. We don't
 * batch the reads because they are pure SELECTs — no transaction needed.
 */
import type { LocalStore } from '../domain/localStore';
import type { CoveredEvent, SyncFileSnapshot } from '../domain/types';

/**
 * Snapshot schema version emitted by this builder.
 *
 * Bumped to 2 when `coveredEventIds: string[]` was replaced by
 * `coveredEvents: CoveredEvent[]`. Any version mismatch is rejected
 * by `applySnapshot` with `IncompatibleSnapshotError` — the sync file
 * body is truncated against `coveredEvents`, so a build that doesn't
 * understand the snapshot cannot safely apply just the body. The
 * engine surfaces the error and asks the user to update the app.
 */
export const SNAPSHOT_VERSION = 2;

/**
 * Sliding retention window for `coveredEvents`. Entries older than
 * `snapshot.createdAt - PRUNE_WINDOW_MS` are dropped from the snapshot
 * to keep the wire format from growing without bound.
 *
 * 30 days balances two concerns:
 *   - Long enough that any device synced within the last month carries
 *     overlapping IDs, so duplicate body events are still detectable
 *     and dropped on upload.
 *   - Short enough that snapshot size stays bounded by ~one month of
 *     write volume rather than the full history.
 *
 * Trade-off: a body event whose ID was pruned from `coveredEvents` will
 * no longer be detected as covered and will ride along in future
 * uploads until the snapshot is rebuilt. In practice this only happens
 * for events with timestamps older than the window (i.e. late
 * cross-device arrivals or imports backdated by 30+ days), which are
 * rare under realistic clock-skew bounds. Applying such an event twice
 * is a no-op under LWW.
 */
const PRUNE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface BuildSnapshotOptions {
  /** Epoch ms cutoff stamped on the snapshot. Defaults to `Date.now()`. */
  readonly createdAt?: number;
}

/**
 * Build a `SyncFileSnapshot` reflecting the current state of the local
 * store. Runs three table scans in parallel; the resulting snapshot is
 * a point-in-time view of expense projections, categories, and recent
 * event IDs (within the retention window).
 */
export async function buildSnapshot(
  store: LocalStore,
  options: BuildSnapshotOptions = {},
): Promise<SyncFileSnapshot> {
  const createdAt = options.createdAt ?? Date.now();
  const cutoff = createdAt - PRUNE_WINDOW_MS;

  // Parallel scans — none of them depend on each other.
  const [expenses, categories, coveredEvents] = await Promise.all([
    store.findAllProjections(),
    store.findAllCategories(),
    collectCoveredEvents(store, cutoff),
  ]);

  return {
    version: SNAPSHOT_VERSION,
    createdAt,
    expenses,
    categories,
    coveredEvents,
  };
}

/**
 * Union of `processed_events` (remote-origin idempotency keys) and the
 * local event-log tables (locally-created events that never appear in
 * `processed_events`). Each entry carries the event's original
 * timestamp so receiving devices can apply the same retention window on
 * their own snapshot rebuilds.
 *
 * Entries with `timestamp <= cutoff` are dropped to bound the wire-format
 * size. De-duplicated (by eventId) and sorted (by eventId) so identical
 * inputs produce identical bytes — helps change-detection (eTag, file
 * size, debugging).
 */
async function collectCoveredEvents(
  store: LocalStore,
  cutoff: number,
): Promise<ReadonlyArray<CoveredEvent>> {
  const [processed, expenseEvents, categoryEvents] = await Promise.all([
    store.findAllProcessedEvents(),
    store.findAllEvents(),
    store.findAllCategoryEvents(),
  ]);

  // De-dupe by eventId. When the same id appears in multiple sources we
  // keep the first occurrence — timestamps for a given eventId are
  // immutable in our model so the choice does not matter.
  const byId = new Map<string, number>();
  for (const entry of processed) {
    if (entry.timestamp > cutoff && !byId.has(entry.eventId)) {
      byId.set(entry.eventId, entry.timestamp);
    }
  }
  for (const e of expenseEvents) {
    if (e.timestamp > cutoff && !byId.has(e.eventId)) {
      byId.set(e.eventId, e.timestamp);
    }
  }
  for (const e of categoryEvents) {
    if (e.timestamp > cutoff && !byId.has(e.eventId)) {
      byId.set(e.eventId, e.timestamp);
    }
  }

  return Array.from(byId.entries())
    .map(([eventId, timestamp]) => ({ eventId, timestamp }))
    .sort((a, b) =>
      a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0,
    );
}
