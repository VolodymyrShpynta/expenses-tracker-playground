/**
 * Tests for `autoSyncSignal.ts` — the module-level pub/sub that
 * mutation hooks use to nudge the auto-sync coordinator.
 *
 * The interesting properties are:
 *   - listeners receive every `notifyLocalWrite()` until they
 *     unsubscribe;
 *   - a listener that throws does not break the fanout to other
 *     listeners (failures are logged, not propagated);
 *   - a listener that unsubscribes mid-iteration does not corrupt the
 *     Set iterator for the remaining listeners.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearLocalWriteListenersForTest,
  notifyLocalWrite,
  onLocalWrite,
} from './autoSyncSignal';

describe('autoSyncSignal', () => {
  beforeEach(() => {
    clearLocalWriteListenersForTest();
  });

  afterEach(() => {
    clearLocalWriteListenersForTest();
    vi.restoreAllMocks();
  });

  it('should be a no-op when there are no subscribers', () => {
    // When/Then: notification with no listeners must not throw
    expect(() => notifyLocalWrite()).not.toThrow();
  });

  it('should call a subscribed listener on each notification', () => {
    // Given
    const listener = vi.fn();
    onLocalWrite(listener);

    // When
    notifyLocalWrite();
    notifyLocalWrite();

    // Then
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should fan out to every subscriber', () => {
    // Given
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    onLocalWrite(a);
    onLocalWrite(b);
    onLocalWrite(c);

    // When
    notifyLocalWrite();

    // Then
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('should stop delivering to a listener after unsubscribe', () => {
    // Given
    const listener = vi.fn();
    const unsubscribe = onLocalWrite(listener);

    // When: fire once, unsubscribe, fire again
    notifyLocalWrite();
    unsubscribe();
    notifyLocalWrite();

    // Then: listener only saw the first event
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should tolerate a listener that unsubscribes another listener mid-iteration', () => {
    // Given: A unsubscribes B the first time it fires; the iteration
    // must keep going without tripping the Set iterator
    let unsubB = (): void => {};
    const a = vi.fn(() => {
      unsubB();
    });
    const b = vi.fn();
    const c = vi.fn();
    onLocalWrite(a);
    unsubB = onLocalWrite(b);
    onLocalWrite(c);

    // When
    notifyLocalWrite();

    // Then: A fired, C still fired; B may or may not have fired since
    // notifyLocalWrite iterates over a snapshot — what matters is no
    // throw and that all listeners that *were* still subscribed at
    // snapshot time get their turn.
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);

    // After unsubscribe, B should no longer receive future notifications
    b.mockClear();
    notifyLocalWrite();
    expect(b).not.toHaveBeenCalled();
  });

  it('should not break fanout when a listener throws', () => {
    // Given: a noisy listener that throws + a quiet one that should
    // still be invoked
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const survivor = vi.fn();
    onLocalWrite(throwing);
    onLocalWrite(survivor);

    // When
    expect(() => notifyLocalWrite()).not.toThrow();

    // Then
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(survivor).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('should not double-register the same listener', () => {
    // Given: same function subscribed twice (Set semantics)
    const listener = vi.fn();
    onLocalWrite(listener);
    onLocalWrite(listener);

    // When
    notifyLocalWrite();

    // Then: only one delivery — Set dedupes
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should clear all listeners via clearLocalWriteListenersForTest', () => {
    // Given
    const listener = vi.fn();
    onLocalWrite(listener);

    // When
    clearLocalWriteListenersForTest();
    notifyLocalWrite();

    // Then
    expect(listener).not.toHaveBeenCalled();
  });
});
