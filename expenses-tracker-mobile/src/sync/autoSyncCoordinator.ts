/**
 * Coordinates automatic sync triggers from multiple sources so they
 * never overlap and never stampede the cloud-drive backend:
 *
 *   • Cold-start / app-foreground transition (`requestSync`)
 *   • Network reconnect                       (`requestSync`)
 *   • Local writes from mutation hooks        (`notifyLocalWrite`)
 *   • App backgrounding                        (`flush`)
 *   • Manual "Sync now" button                 (`requestSync({ force: true })`)
 *
 * Behavioural contract:
 *   - **In-flight guard.** Only one sync runs at a time. Auto-triggers
 *     that arrive while a sync is in progress are dropped silently —
 *     they'll fire again on the next trigger.
 *   - **Min-interval throttle.** Two consecutive auto-syncs must be at
 *     least `minIntervalMs` apart. `force: true` (manual button)
 *     bypasses this; the in-flight guard still applies.
 *   - **Debounced after-write.** `notifyLocalWrite` (re)schedules a
 *     trailing-edge debounce — each new edit pushes the timer back by
 *     `quietMs`, capped at a hard `ceilingMs` from the first edit so a
 *     long burst still uploads eventually.
 *   - **Flush.** Runs the pending debounced sync immediately, regardless
 *     of throttle. No-op when nothing is pending. Used when the app is
 *     backgrounded so local edits don't sit on the device.
 *
 * Pure TypeScript — no React, no React Native, no timers from the global
 * scope unless you let it default. All scheduling is injectable so the
 * vitest test file can drive it with a fake clock.
 */

/** Trailing-edge debounce window applied to `notifyLocalWrite`. */
export const QUIET_DEBOUNCE_MS = 15_000;
/** Hard ceiling on the debounce — guarantees upload during a long edit burst. */
export const CEILING_MS = 60_000;
/** Minimum gap between two consecutive auto-syncs (manual `force: true` bypasses). */
export const MIN_AUTO_INTERVAL_MS = 30_000;

export type SyncReason =
  | 'cold-start'
  | 'app-active'
  | 'after-write'
  | 'background-flush'
  | 'net-reconnect'
  | 'manual';

export interface AutoSyncOptions {
  readonly quietMs?: number;
  readonly ceilingMs?: number;
  readonly minIntervalMs?: number;
  readonly clock?: () => number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface AutoSyncCoordinator {
  /** A local write succeeded — (re)schedule the debounced upload. */
  notifyLocalWrite(): void;

  /**
   * Request a sync now.
   *   - `force: true` skips the min-interval throttle (used for the
   *     manual "Sync now" button).
   *   - In-flight syncs always cause this call to return immediately.
   */
  requestSync(reason: SyncReason, opts?: { force?: boolean }): Promise<void>;

  /**
   * Run the pending debounced sync immediately. No-op when nothing is
   * pending. Always bypasses the min-interval throttle.
   */
  flush(reason?: SyncReason): Promise<void>;

  /** Cancel any pending debounce timer. Call from React effect cleanup. */
  dispose(): void;
}

export function createAutoSyncCoordinator(
  syncFn: (reason: SyncReason) => Promise<void>,
  opts: AutoSyncOptions = {},
): AutoSyncCoordinator {
  const quietMs = opts.quietMs ?? QUIET_DEBOUNCE_MS;
  const ceilingMs = opts.ceilingMs ?? CEILING_MS;
  const minIntervalMs = opts.minIntervalMs ?? MIN_AUTO_INTERVAL_MS;
  const clock = opts.clock ?? Date.now;
  const setTimer =
    opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    opts.clearTimer ??
    ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let debounceHandle: unknown = null;
  // Timestamp of the first write in the current debounce burst — used to
  // enforce the hard `ceilingMs` cap.
  let firstWriteAt: number | null = null;
  let lastSyncAt = 0;
  // Distinguishes "never synced yet" from "last synced at clock=0". Using
  // a plain `lastSyncAt > 0` check would silently disable the throttle
  // when the wall clock happens to be near zero (tests, fake clocks).
  let hasSynced = false;
  let inFlight = false;

  function cancelDebounce(): void {
    if (debounceHandle !== null) {
      clearTimer(debounceHandle);
      debounceHandle = null;
    }
  }

  async function executeSync(reason: SyncReason): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    cancelDebounce();
    firstWriteAt = null;
    try {
      await syncFn(reason);
    } finally {
      inFlight = false;
      // Always update — a failed sync still counts toward the throttle
      // so we don't hammer a broken endpoint.
      lastSyncAt = clock();
      hasSynced = true;
    }
  }

  return {
    notifyLocalWrite(): void {
      const now = clock();
      if (firstWriteAt === null) firstWriteAt = now;
      cancelDebounce();
      const budget = Math.max(0, ceilingMs - (now - firstWriteAt));
      const delay = Math.min(quietMs, budget);
      debounceHandle = setTimer(() => {
        debounceHandle = null;
        void executeSync('after-write');
      }, delay);
    },

    async requestSync(
      reason: SyncReason,
      options?: { force?: boolean },
    ): Promise<void> {
      if (inFlight) return;
      const force = options?.force ?? false;
      const now = clock();
      // The very first sync always runs — there's nothing to throttle against.
      if (!force && hasSynced && now - lastSyncAt < minIntervalMs) return;
      await executeSync(reason);
    },

    async flush(reason: SyncReason = 'background-flush'): Promise<void> {
      if (debounceHandle === null && firstWriteAt === null) return;
      await executeSync(reason);
    },

    dispose(): void {
      cancelDebounce();
    },
  };
}
