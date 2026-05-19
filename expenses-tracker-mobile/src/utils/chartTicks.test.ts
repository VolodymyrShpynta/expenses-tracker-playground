/**
 * Tests for `pickTickIndices` — the evenly-spaced X-axis tick picker
 * shared by `SparklineChart` and `ExpenseTimeSeriesChart`.
 *
 * The function has three behavioural concerns we exercise here:
 *   1. Edge cases for very small `n` (0, 1) and degenerate `target`.
 *   2. Aesthetic degradation: for `target ∈ {3, 4}` the chart looks
 *      visibly off-centre unless `(n-1)` divides cleanly into
 *      `(desired-1)` gaps; the function steps `desired` down when that
 *      fails. Five or more ticks tolerate rounding wobble.
 *   3. Endpoint invariant: the result always starts at `0` and ends at
 *      `n-1` (when at least two ticks are produced).
 */
import { describe, expect, it } from 'vitest';

import { pickTickIndices } from './chartTicks';

describe('pickTickIndices — edge cases', () => {
  it('returns an empty array for n=0', () => {
    expect(pickTickIndices(0, 4)).toEqual([]);
  });

  it('returns a single-index array for n=1', () => {
    expect(pickTickIndices(1, 4)).toEqual([0]);
  });

  it('returns [0, n-1] when target is below the minimum (1)', () => {
    expect(pickTickIndices(5, 1)).toEqual([0, 4]);
  });

  it('returns [0, n-1] when target is zero', () => {
    expect(pickTickIndices(5, 0)).toEqual([0, 4]);
  });

  it('caps target at n when target > n', () => {
    expect(pickTickIndices(3, 10)).toEqual([0, 1, 2]);
  });
});

describe('pickTickIndices — no degradation needed', () => {
  it('produces 4 evenly spaced ticks when (n-1) % 3 === 0', () => {
    expect(pickTickIndices(4, 4)).toEqual([0, 1, 2, 3]);
    expect(pickTickIndices(7, 4)).toEqual([0, 2, 4, 6]);
    expect(pickTickIndices(13, 4)).toEqual([0, 4, 8, 12]);
  });

  it('produces 3 evenly spaced ticks when (n-1) % 2 === 0', () => {
    expect(pickTickIndices(3, 3)).toEqual([0, 1, 2]);
    expect(pickTickIndices(5, 3)).toEqual([0, 2, 4]);
    expect(pickTickIndices(9, 3)).toEqual([0, 4, 8]);
  });

  it('produces 2 endpoint ticks for target=2', () => {
    expect(pickTickIndices(2, 2)).toEqual([0, 1]);
    expect(pickTickIndices(6, 2)).toEqual([0, 5]);
  });
});

describe('pickTickIndices — degradation rules', () => {
  it('degrades target=4 to 3 when (n-1) % 3 !== 0 but (n-1) % 2 === 0', () => {
    // n=9 → (n-1)%3 = 2, (n-1)%2 = 0 → desired becomes 3.
    expect(pickTickIndices(9, 4)).toEqual([0, 4, 8]);
    // n=11 → (n-1)%3 = 1, (n-1)%2 = 0 → desired becomes 3.
    expect(pickTickIndices(11, 4)).toEqual([0, 5, 10]);
  });

  it('cascades target=4 → 3 → 2 when neither divisor fits', () => {
    // n=6 → 5%3=2 and 5%2=1 → desired becomes 2.
    expect(pickTickIndices(6, 4)).toEqual([0, 5]);
    // n=8 → 7%3=1 and 7%2=1 → desired becomes 2.
    expect(pickTickIndices(8, 4)).toEqual([0, 7]);
  });

  it('degrades target=3 to 2 when (n-1) is odd', () => {
    expect(pickTickIndices(4, 3)).toEqual([0, 3]);
    expect(pickTickIndices(6, 3)).toEqual([0, 5]);
    expect(pickTickIndices(8, 3)).toEqual([0, 7]);
  });
});

describe('pickTickIndices — target ≥ 5 tolerates rounding wobble', () => {
  it('does NOT degrade target=5 even when gaps are uneven', () => {
    // 5 ticks across 6 buckets: positions at 0, 1.25, 2.5, 3.75, 5.
    expect(pickTickIndices(6, 5)).toEqual([0, 1, 3, 4, 5]);
  });

  it('does NOT degrade target=6 even when gaps are uneven', () => {
    // 6 ticks across 10 buckets: positions at 0, 1.8, 3.6, 5.4, 7.2, 9.
    expect(pickTickIndices(10, 6)).toEqual([0, 2, 4, 5, 7, 9]);
  });
});

describe('pickTickIndices — invariants', () => {
  it('always includes both endpoints when n ≥ 2', () => {
    for (let n = 2; n <= 20; n++) {
      for (let target = 2; target <= 6; target++) {
        const ticks = pickTickIndices(n, target);
        expect(ticks[0]).toBe(0);
        expect(ticks[ticks.length - 1]).toBe(n - 1);
      }
    }
  });

  it('produces strictly increasing, in-range indices', () => {
    for (let n = 2; n <= 20; n++) {
      for (let target = 2; target <= 6; target++) {
        const ticks = pickTickIndices(n, target);
        for (let i = 0; i < ticks.length; i++) {
          expect(ticks[i]).toBeGreaterThanOrEqual(0);
          expect(ticks[i]).toBeLessThan(n);
          if (i > 0) {
            expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
          }
        }
      }
    }
  });

  it('never returns more than `target` indices (after capping)', () => {
    for (let n = 2; n <= 20; n++) {
      for (let target = 2; target <= 6; target++) {
        const ticks = pickTickIndices(n, target);
        expect(ticks.length).toBeLessThanOrEqual(Math.min(target, n));
      }
    }
  });
});
