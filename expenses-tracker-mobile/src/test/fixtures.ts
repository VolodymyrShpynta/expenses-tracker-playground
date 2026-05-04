/**
 * Test helpers — fixed-time and deterministic id generators, plus a
 * convenience factory for building a fresh `ExpensePayload` /
 * `ExpenseProjection`. Keeps the test bodies focused on Given/When/Then.
 */
import type { ExpensePayload, ExpenseProjection } from '../domain/types.ts';
import type { TimeProvider } from '../utils/time.ts';
import type { IdGenerator } from '../domain/commands.ts';

export const TEST_USER_ID = 'user-test-1';

/** Time provider that walks a fixed sequence of timestamps. */
export function sequenceTime(timestamps: number[]): TimeProvider {
  let i = 0;
  return {
    nowMs: () => {
      const t = timestamps[i];
      if (t === undefined) {
        throw new Error(`sequenceTime exhausted after ${timestamps.length} calls`);
      }
      i += 1;
      return t;
    },
  };
}

/** Time provider that always returns the same timestamp. */
export function fixedTime(epochMs: number): TimeProvider {
  return { nowMs: () => epochMs };
}

/** Deterministic id generator. */
export function sequenceIds(ids: string[]): IdGenerator {
  let i = 0;
  return {
    newUuid: () => {
      const id = ids[i];
      if (id === undefined) {
        throw new Error(`sequenceIds exhausted after ${ids.length} calls`);
      }
      i += 1;
      return id;
    },
  };
}

export function makePayload(overrides: Partial<ExpensePayload> & { id: string; updatedAt: number }): ExpensePayload {
  return {
    description: 'Coffee',
    amount: 350,
    currency: 'USD',
    categoryId: 'cat-1',
    date: '2026-01-01T08:00:00Z',
    deleted: false,
    userId: TEST_USER_ID,
    ...overrides,
  };
}

export function makeProjection(
  overrides: Partial<ExpenseProjection> & { id: string; updatedAt: number },
): ExpenseProjection {
  return {
    description: 'Coffee',
    amount: 350,
    currency: 'USD',
    categoryId: 'cat-1',
    date: '2026-01-01T08:00:00Z',
    deleted: false,
    userId: TEST_USER_ID,
    ...overrides,
  };
}
