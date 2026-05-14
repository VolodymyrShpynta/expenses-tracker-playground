/**
 * AutoSyncCoordinator unit tests — drive the coordinator with a fake
 * clock and fake timers so we can verify scheduling behaviour without
 * `vi.useFakeTimers()` ceremony.
 *
 * Conventions:
 *   - `advance(ms)` advances the clock AND fires any timers that fall
 *     due. Mirrors how a real event loop would behave.
 *   - `syncFn` resolves on the next microtask so we can assert on call
 *     counts after each `await advance(...)` cycle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CEILING_MS,
  MIN_AUTO_INTERVAL_MS,
  QUIET_DEBOUNCE_MS,
  createAutoSyncCoordinator,
  type SyncReason,
} from './autoSyncCoordinator';

interface FakeTimer {
  readonly id: number;
  due: number;
  readonly fn: () => void;
}

function makeFakeScheduler() {
  let now = 0;
  let nextId = 1;
  let timers: FakeTimer[] = [];

  const clock = () => now;
  const setTimer = (fn: () => void, ms: number) => {
    const t: FakeTimer = { id: nextId++, due: now + ms, fn };
    timers.push(t);
    return t.id;
  };
  const clearTimer = (h: unknown) => {
    timers = timers.filter((t) => t.id !== h);
  };

  /**
   * Advance the clock by `ms` and fire any due timers in order. Returns
   * a flushed Promise so callers can `await advance(...)` and observe
   * the result of any async work the timers kicked off.
   */
  async function advance(ms: number): Promise<void> {
    now += ms;
    const due = timers
      .filter((t) => t.due <= now)
      .sort((a, b) => a.due - b.due);
    timers = timers.filter((t) => t.due > now);
    for (const t of due) t.fn();
    // Flush microtasks so awaited promises inside the coordinator settle.
    await Promise.resolve();
    await Promise.resolve();
  }

  function setNow(n: number): void {
    now = n;
  }

  return { clock, setTimer, clearTimer, advance, setNow };
}

describe('AutoSyncCoordinator', () => {
  let scheduler: ReturnType<typeof makeFakeScheduler>;
  let syncFn: ReturnType<typeof vi.fn>;
  let reasons: SyncReason[];

  beforeEach(() => {
    scheduler = makeFakeScheduler();
    reasons = [];
    syncFn = vi.fn(async (reason: SyncReason) => {
      reasons.push(reason);
    });
  });

  function makeCoordinator(overrides: Partial<{ minIntervalMs: number }> = {}) {
    return createAutoSyncCoordinator(syncFn as (r: SyncReason) => Promise<void>, {
      clock: scheduler.clock,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      ...overrides,
    });
  }

  it('runs debounced sync after the quiet window when a single write arrives', async () => {
    const c = makeCoordinator();
    c.notifyLocalWrite();

    await scheduler.advance(QUIET_DEBOUNCE_MS - 1);
    expect(syncFn).not.toHaveBeenCalled();

    await scheduler.advance(1);
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(['after-write']);
  });

  it('resets the debounce on subsequent writes', async () => {
    const c = makeCoordinator();
    c.notifyLocalWrite();
    await scheduler.advance(10_000);
    expect(syncFn).not.toHaveBeenCalled();

    // Second edit before the quiet window elapses pushes the timer back.
    c.notifyLocalWrite();
    await scheduler.advance(QUIET_DEBOUNCE_MS - 1);
    expect(syncFn).not.toHaveBeenCalled();

    await scheduler.advance(1);
    expect(syncFn).toHaveBeenCalledTimes(1);
  });

  it('enforces the hard ceiling during a continuous edit burst', async () => {
    const c = makeCoordinator();
    c.notifyLocalWrite();

    // Hammer the coordinator every 1 s — without a ceiling this would
    // starve the upload forever.
    for (let elapsed = 0; elapsed < CEILING_MS; elapsed += 1_000) {
      await scheduler.advance(1_000);
      c.notifyLocalWrite();
    }
    // We've reached the ceiling — the next debounce delay is 0, so the
    // sync fires on the next microtask flush.
    await scheduler.advance(0);
    expect(syncFn).toHaveBeenCalledTimes(1);
  });

  it('clears the burst window after a sync runs so the next write debounces fresh', async () => {
    const c = makeCoordinator();
    c.notifyLocalWrite();
    await scheduler.advance(QUIET_DEBOUNCE_MS);
    expect(syncFn).toHaveBeenCalledTimes(1);

    // Min-interval is the next gate — jump past it.
    await scheduler.advance(MIN_AUTO_INTERVAL_MS);

    c.notifyLocalWrite();
    await scheduler.advance(QUIET_DEBOUNCE_MS - 1);
    expect(syncFn).toHaveBeenCalledTimes(1);
    await scheduler.advance(1);
    expect(syncFn).toHaveBeenCalledTimes(2);
  });

  it('throttles auto requestSync calls within the min-interval', async () => {
    const c = makeCoordinator();
    await c.requestSync('cold-start');
    expect(syncFn).toHaveBeenCalledTimes(1);

    await scheduler.advance(MIN_AUTO_INTERVAL_MS - 1);
    await c.requestSync('app-active');
    expect(syncFn).toHaveBeenCalledTimes(1); // throttled

    await scheduler.advance(1);
    await c.requestSync('app-active');
    expect(syncFn).toHaveBeenCalledTimes(2);
  });

  it('allows force:true to bypass the min-interval throttle', async () => {
    const c = makeCoordinator();
    await c.requestSync('cold-start');
    expect(syncFn).toHaveBeenCalledTimes(1);

    await scheduler.advance(1_000);
    await c.requestSync('manual', { force: true });
    expect(syncFn).toHaveBeenCalledTimes(2);
    expect(reasons.at(-1)).toBe('manual');
  });

  it('always runs the very first sync regardless of throttle', async () => {
    const c = makeCoordinator();
    // lastSyncAt is 0 — even though clock() === 0, the throttle should
    // not block the first sync.
    await c.requestSync('cold-start');
    expect(syncFn).toHaveBeenCalledTimes(1);
  });

  it('flush runs the pending debounced sync immediately', async () => {
    const c = makeCoordinator();
    c.notifyLocalWrite();
    await scheduler.advance(1_000);
    expect(syncFn).not.toHaveBeenCalled();

    await c.flush();
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(['background-flush']);
  });

  it('flush is a no-op when nothing is pending', async () => {
    const c = makeCoordinator();
    await c.flush();
    expect(syncFn).not.toHaveBeenCalled();
  });

  it('skips overlapping auto requests while a sync is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    syncFn.mockImplementation(async (reason: SyncReason) => {
      reasons.push(reason);
      await gate;
    });

    const c = makeCoordinator();
    const first = c.requestSync('cold-start');
    // Second request fires while the first is still awaiting `gate`.
    await c.requestSync('app-active');
    expect(syncFn).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(syncFn).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending debounce timer when dispose() is called', async () => {
    const c = makeCoordinator();
    c.notifyLocalWrite();
    c.dispose();
    await scheduler.advance(QUIET_DEBOUNCE_MS + 10_000);
    expect(syncFn).not.toHaveBeenCalled();
  });
});
