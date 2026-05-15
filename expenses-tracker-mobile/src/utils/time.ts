/**
 * Time provider abstraction.
 *
 * All projector / sync code receives a `TimeProvider` parameter so tests can
 * inject a fixed-time provider for deterministic scenarios — same reason
 * the backend has the `TimeProvider` Kotlin class.
 *
 * Production wires `systemTime`; tests construct a `fixedTime(epochMs)` or
 * `sequenceTime([t1, t2, …])` provider.
 */
export interface TimeProvider {
  /** Current epoch milliseconds. */
  nowMs(): number;
}

export const systemTime: TimeProvider = {
  nowMs: () => Date.now(),
};

/**
 * Return a strictly-greater-than-existing `updatedAt` value for the next
 * write. Caps the wall-clock value above `existingUpdatedAt` so the
 * strict-`>` LWW UPSERT inside `projectFromEvent` / `projectCategoryFromEvent`
 * never silently drops the write — which would happen whenever
 * `existingUpdatedAt` was set by a synced event from a peer with a faster
 * clock than ours (or in the same millisecond as a previous local write).
 *
 * The event's own `timestamp` field continues to record the wall-clock
 * value separately; only the projection's `updatedAt` is bumped.
 */
export function nextUpdatedAt(
  time: TimeProvider,
  existingUpdatedAt: number,
): number {
  return Math.max(time.nowMs(), existingUpdatedAt + 1);
}
