/**
 * Snapshot-related upload decisions:
 *
 *   - `shouldRefreshSnapshot` — when to rebuild the embedded snapshot.
 *   - `dropCoveredEvents` — what events to drop from the file body
 *     because the snapshot already captures them.
 *
 * Both functions are pure and run once per sync cycle just before
 * encoding the file. They share the goal of keeping the on-wire payload
 * proportional to "events since the snapshot" rather than "events of
 * all time".
 *
 * Why a refresh policy at all: rewriting the snapshot every cycle wastes
 * bandwidth (the full read-model state is the dominant payload). Never
 * rewriting it means the snapshot stays fixed at the moment some device
 * first created it, and the cold-install benefit shrinks as new events
 * accumulate past the cutoff.
 *
 * The chosen heuristic — refresh when N events past the snapshot — is
 * self-tuning: idle periods produce no rewrites, busy periods produce
 * exactly enough to keep cold-install cost bounded.
 *
 * NOTE: The snapshot is purely an optimization. If this policy were
 * disabled entirely, sync would still be correct — just slower for cold
 * installs once the event log grows.
 */
import type {
  CategoryEventEntry,
  CoveredEvent,
  EventEntry,
  SyncFileSnapshot,
} from '../domain/types';

/**
 * Refresh the snapshot when this many events have accumulated past the
 * existing snapshot's `createdAt`. Higher = less bandwidth per sync,
 * slower cold installs. 500 keeps cold-install apply under ~10 s on
 * mid-range Android given the batched-apply path.
 *
 * Counted across BOTH expense and category event streams.
 */
export const SNAPSHOT_REFRESH_THRESHOLD = 500;

/**
 * `true` when the snapshot in the cloud file should be rebuilt and
 * re-uploaded this cycle.
 *
 * Cases:
 *   - No snapshot in the remote file → always refresh (first writer wins).
 *   - Snapshot present, but more than `threshold` events past its
 *     cutoff → refresh.
 *   - Otherwise keep the existing snapshot (free bandwidth — the engine
 *     re-uploads the same bytes).
 */
export function shouldRefreshSnapshot(
  baseSnapshot: SyncFileSnapshot | undefined,
  events: ReadonlyArray<EventEntry>,
  categoryEvents: ReadonlyArray<CategoryEventEntry>,
  threshold: number = SNAPSHOT_REFRESH_THRESHOLD,
): boolean {
  if (baseSnapshot === undefined) return true;
  const cutoff = baseSnapshot.createdAt;
  const post = countEventsAfter(events, cutoff) + countEventsAfter(categoryEvents, cutoff);
  return post > threshold;
}

function countEventsAfter(
  events: ReadonlyArray<{ readonly timestamp: number }>,
  cutoff: number,
): number {
  let count = 0;
  for (const event of events) {
    if (event.timestamp > cutoff) count += 1;
  }
  return count;
}

/**
 * Drop every event whose `eventId` is captured by the snapshot's
 * `coveredEvents`. Used by the engine just before encoding the file
 * for upload — together with the snapshot itself, this enforces the
 * invariant "the body contains only events not yet captured by the
 * embedded snapshot".
 *
 * Always safe to run: with no snapshot (or an empty `coveredEvents`)
 * the input is returned unchanged. Idempotent — a second pass over an
 * already-truncated body is a no-op.
 *
 * Note that the snapshot may prune entries past its retention window
 * (see `snapshotBuilder.PRUNE_WINDOW_MS`), so a body event whose
 * timestamp is much older than the snapshot's `createdAt` may not be
 * present in `coveredEvents` and will therefore NOT be dropped. Such an
 * event will be re-applied as a LWW no-op on receiving devices.
 *
 * Runs on every cycle (not only on refresh) so legacy files written
 * before truncation existed, plus any interrupted cycles, self-heal on
 * the next upload.
 */
export function dropCoveredEvents<T extends { readonly eventId: string }>(
  events: ReadonlyArray<T>,
  coveredEvents: ReadonlyArray<CoveredEvent>,
): ReadonlyArray<T> {
  if (coveredEvents.length === 0 || events.length === 0) return events;
  const covered = new Set(coveredEvents.map((c) => c.eventId));
  return events.filter((e) => !covered.has(e.eventId));
}
