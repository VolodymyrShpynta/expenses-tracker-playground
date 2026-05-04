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
