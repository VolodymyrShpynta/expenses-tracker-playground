/**
 * Tests for the pure `computeCategorySeries` / `computeTotalSeries`
 * aggregators. The React wiring (in `app/(tabs)/overview.tsx`) is
 * intentionally not exercised here — it's `useMemo` plumbing only.
 *
 * Convention mirrors `categorySummary.test.ts`: BDD-style `it` blocks
 * with explicit Given/When/Then, a `fakeExpense` factory, and a fixed
 * `NOW` so the upper-bound clamp ("clamp to today") is deterministic.
 */
import { describe, expect, it } from 'vitest';

import {
  bucketStart,
  computeCategorySeries,
  computeTotalSeries,
  DEFAULT_TOP_N,
  enumerateBuckets,
  OTHER_SERIES_ID,
  type MaybeApprox,
} from './timeSeries';
import type { DateRange } from '../utils/dateRange';

const NOW = new Date(2024, 4, 15, 12, 0, 0); // 15 May 2024 noon local

type FakeExpenseInput = {
  readonly id: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly description?: string;
  readonly date?: string | undefined;
  readonly categoryId?: string | undefined;
  readonly updatedAt?: number;
  readonly deleted?: boolean;
  readonly approx?: boolean;
};

function fakeExpense(over: FakeExpenseInput): MaybeApprox {
  const base = {
    id: over.id,
    amount: over.amount ?? 100,
    currency: over.currency ?? 'USD',
    description: over.description ?? '',
    updatedAt: over.updatedAt ?? 0,
    deleted: over.deleted ?? false,
    approx: over.approx ?? false,
  };
  const date: string | undefined =
    'date' in over ? over.date : '2024-05-10T10:00:00';
  const categoryId: string | undefined =
    'categoryId' in over ? over.categoryId : 'cat-a';
  return {
    ...base,
    ...(date !== undefined ? { date } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
  };
}

function rangeOfMay2024(): DateRange {
  return {
    from: new Date(2024, 4, 1, 0, 0, 0),
    to: new Date(2024, 4, 31, 23, 59, 59, 999),
  };
}

describe('bucketStart', () => {
  it('should pin a day bucket to local midnight', () => {
    // Given: an expense logged at 14:37 local
    const date = new Date(2024, 4, 10, 14, 37, 0);

    // When
    const bucket = bucketStart(date, 'day');

    // Then
    expect(bucket.getFullYear()).toBe(2024);
    expect(bucket.getMonth()).toBe(4);
    expect(bucket.getDate()).toBe(10);
    expect(bucket.getHours()).toBe(0);
    expect(bucket.getMinutes()).toBe(0);
  });

  it('should pin a month bucket to the 1st at local midnight', () => {
    // Given: 29 Feb 2024 (leap day) at noon
    const date = new Date(2024, 1, 29, 12, 0, 0);

    // When
    const bucket = bucketStart(date, 'month');

    // Then
    expect(bucket.getFullYear()).toBe(2024);
    expect(bucket.getMonth()).toBe(1);
    expect(bucket.getDate()).toBe(1);
  });

  it('should pin a year bucket to January 1st at local midnight', () => {
    // Given: an expense at the end of the year
    const date = new Date(2024, 11, 31, 23, 59, 0);

    // When
    const bucket = bucketStart(date, 'year');

    // Then
    expect(bucket.getFullYear()).toBe(2024);
    expect(bucket.getMonth()).toBe(0);
    expect(bucket.getDate()).toBe(1);
  });
});

describe('enumerateBuckets', () => {
  it('should produce one bucket per day across a 31-day month', () => {
    // Given: full month of May 2024
    const range = rangeOfMay2024();

    // When
    const buckets = enumerateBuckets(range, 'day');

    // Then
    expect(buckets).toHaveLength(31);
    expect(new Date(buckets[0]!).getDate()).toBe(1);
    expect(new Date(buckets[30]!).getDate()).toBe(31);
  });

  it('should produce 12 month buckets for a calendar year', () => {
    // Given: full year 2024
    const range: DateRange = {
      from: new Date(2024, 0, 1),
      to: new Date(2024, 11, 31, 23, 59, 59, 999),
    };

    // When
    const buckets = enumerateBuckets(range, 'month');

    // Then
    expect(buckets).toHaveLength(12);
    expect(new Date(buckets[0]!).getMonth()).toBe(0);
    expect(new Date(buckets[11]!).getMonth()).toBe(11);
  });

  it('should handle the leap-year February → March transition', () => {
    // Given: Feb–Mar 2024 (29-day Feb)
    const range: DateRange = {
      from: new Date(2024, 1, 1),
      to: new Date(2024, 2, 31, 23, 59, 59, 999),
    };

    // When
    const buckets = enumerateBuckets(range, 'day');

    // Then: 29 (Feb) + 31 (Mar) = 60 buckets
    expect(buckets).toHaveLength(60);
  });

  it('should return an empty list when the range is inverted', () => {
    // Given: to < from
    const range: DateRange = {
      from: new Date(2024, 4, 10),
      to: new Date(2024, 4, 5),
    };

    // When
    const buckets = enumerateBuckets(range, 'day');

    // Then
    expect(buckets).toEqual([]);
  });
});

describe('computeCategorySeries', () => {
  it('should return empty buckets and series for an empty input', () => {
    // Given
    const range: DateRange = {
      from: new Date(2024, 4, 1),
      to: new Date(2024, 4, 7, 23, 59, 59, 999),
    };

    // When
    const result = computeCategorySeries([], range, 'day', DEFAULT_TOP_N, NOW);

    // Then
    expect(result.buckets).toHaveLength(7);
    expect(result.series).toEqual([]);
  });

  it('should place a single expense in the correct bucket', () => {
    // Given: one expense on May 3 in a Mon..Fri range
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 500, date: '2024-05-03T09:00:00', categoryId: 'cat-a' }),
    ];
    const range: DateRange = {
      from: new Date(2024, 4, 1),
      to: new Date(2024, 4, 7, 23, 59, 59, 999),
    };

    // When
    const result = computeCategorySeries(expenses, range, 'day', DEFAULT_TOP_N, NOW);

    // Then: 7 daily buckets, May 3 = index 2 carries 500
    expect(result.buckets).toHaveLength(7);
    expect(result.series).toHaveLength(1);
    const series = result.series[0]!;
    expect(series.categoryId).toBe('cat-a');
    expect(series.total).toBe(500);
    expect(series.points[0]).toBe(0);
    expect(series.points[1]).toBe(0);
    expect(series.points[2]).toBe(500);
    expect(series.points[3]).toBe(0);
  });

  it('should aggregate multiple expenses on the same bucket', () => {
    // Given: two expenses on May 10 in different categories + one on May 11
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: '1', amount: 100, date: '2024-05-10T08:00:00', categoryId: 'cat-a' }),
      fakeExpense({ id: '2', amount: 200, date: '2024-05-10T18:00:00', categoryId: 'cat-a' }),
      fakeExpense({ id: '3', amount: 50, date: '2024-05-11T10:00:00', categoryId: 'cat-b' }),
    ];

    // When
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'day', DEFAULT_TOP_N, NOW);

    // Then: cat-a totals 300 on May-10; cat-b totals 50 on May-11
    const catA = result.series.find((s) => s.categoryId === 'cat-a')!;
    const catB = result.series.find((s) => s.categoryId === 'cat-b')!;
    expect(catA.total).toBe(300);
    expect(catA.points[9]).toBe(300); // May 10 = index 9
    expect(catB.total).toBe(50);
    expect(catB.points[10]).toBe(50); // May 11 = index 10
  });

  it('should sort series by total descending and put __other last', () => {
    // Given: 5 categories with descending totals
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: '1', amount: 500, categoryId: 'cat-big' }),
      fakeExpense({ id: '2', amount: 400, categoryId: 'cat-second' }),
      fakeExpense({ id: '3', amount: 300, categoryId: 'cat-third' }),
      fakeExpense({ id: '4', amount: 200, categoryId: 'cat-fourth' }),
      fakeExpense({ id: '5', amount: 100, categoryId: 'cat-fifth' }),
    ];

    // When: topN = 2 → 2 named + 1 __other
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'month', 2, NOW);

    // Then
    expect(result.series.map((s) => s.categoryId)).toEqual([
      'cat-big',
      'cat-second',
      OTHER_SERIES_ID,
    ]);
    // __other rolls up the remaining three: 300 + 200 + 100 = 600
    const other = result.series.find((s) => s.categoryId === OTHER_SERIES_ID)!;
    expect(other.total).toBe(600);
  });

  it('should sum __other points correctly per bucket', () => {
    // Given: long-tail cats with spend in different buckets
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 1000, categoryId: 'cat-big', date: '2024-05-01T10:00:00' }),
      fakeExpense({ id: 'b1', amount: 30, categoryId: 'cat-tail-1', date: '2024-05-01T11:00:00' }),
      fakeExpense({ id: 'b2', amount: 20, categoryId: 'cat-tail-1', date: '2024-05-05T11:00:00' }),
      fakeExpense({ id: 'c1', amount: 40, categoryId: 'cat-tail-2', date: '2024-05-01T12:00:00' }),
    ];

    // When: topN = 1 → 1 named + 1 __other rolling up cat-tail-1 and cat-tail-2
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'day', 1, NOW);

    // Then
    const other = result.series.find((s) => s.categoryId === OTHER_SERIES_ID)!;
    expect(other.points[0]).toBe(70); // May 1 = 30 + 40
    expect(other.points[4]).toBe(20); // May 5 = 20
    expect(other.total).toBe(90);
  });

  it('should OR-propagate `approx` across contributors into the series and __other', () => {
    // Given: one approx and one exact expense in cat-a, both rolled into __other
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'big', amount: 1000, categoryId: 'cat-big', approx: false }),
      fakeExpense({ id: 'a1', amount: 100, categoryId: 'cat-a', approx: true }),
      fakeExpense({ id: 'a2', amount: 100, categoryId: 'cat-a', approx: false }),
      fakeExpense({ id: 'b1', amount: 50, categoryId: 'cat-b', approx: false }),
    ];

    // When: topN = 1 → cat-big kept; cat-a and cat-b roll into __other
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'month', 1, NOW);

    // Then
    const big = result.series.find((s) => s.categoryId === 'cat-big')!;
    const other = result.series.find((s) => s.categoryId === OTHER_SERIES_ID)!;
    expect(big.approx).toBe(false);
    expect(other.approx).toBe(true);
  });

  it('should exclude expenses outside the range', () => {
    // Given: expenses bracketing a May-only range
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'apr', amount: 100, categoryId: 'cat-a', date: '2024-04-30T23:00:00' }),
      fakeExpense({ id: 'may', amount: 200, categoryId: 'cat-a', date: '2024-05-15T10:00:00' }),
      fakeExpense({ id: 'jun', amount: 400, categoryId: 'cat-a', date: '2024-06-01T01:00:00' }),
    ];

    // When
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'day', DEFAULT_TOP_N, NOW);

    // Then: only the May expense survives
    const catA = result.series.find((s) => s.categoryId === 'cat-a')!;
    expect(catA.total).toBe(200);
  });

  it('should clamp the upper bound of `range.to` to end-of-today', () => {
    // Given: range that extends past NOW (15 May), and a future expense
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'past', amount: 100, categoryId: 'cat-a', date: '2024-05-10T10:00:00' }),
      fakeExpense({ id: 'future', amount: 999, categoryId: 'cat-a', date: '2024-05-20T10:00:00' }),
    ];

    // When: NOW = 15 May → 20 May is clamped out
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'day', DEFAULT_TOP_N, NOW);

    // Then
    const catA = result.series.find((s) => s.categoryId === 'cat-a')!;
    expect(catA.total).toBe(100);
    // Buckets stop at 15 May (= 15 buckets: May 1..15)
    expect(result.buckets).toHaveLength(15);
  });

  it('should skip expenses without `date` or `categoryId`', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'no-date', amount: 100, categoryId: 'cat-a', date: undefined }),
      fakeExpense({ id: 'no-cat', amount: 100, categoryId: undefined, date: '2024-05-10T10:00:00' }),
      fakeExpense({ id: 'ok', amount: 250, categoryId: 'cat-a', date: '2024-05-10T10:00:00' }),
    ];

    // When
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'day', DEFAULT_TOP_N, NOW);

    // Then: only the well-formed expense contributes
    expect(result.series).toHaveLength(1);
    expect(result.series[0]!.total).toBe(250);
  });

  it('should not produce an __other series when there is no long tail', () => {
    // Given: 2 categories, topN = 5
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: '1', amount: 100, categoryId: 'cat-a' }),
      fakeExpense({ id: '2', amount: 50, categoryId: 'cat-b' }),
    ];

    // When
    const result = computeCategorySeries(expenses, rangeOfMay2024(), 'month', 5, NOW);

    // Then
    expect(result.series.some((s) => s.categoryId === OTHER_SERIES_ID)).toBe(false);
  });
});

describe('computeTotalSeries', () => {
  it('should sum every in-range expense regardless of category', () => {
    // Given: one categorized and one uncategorized expense in May
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: '1', amount: 100, categoryId: 'cat-a', date: '2024-05-01T10:00:00' }),
      fakeExpense({ id: '2', amount: 50, categoryId: undefined, date: '2024-05-01T11:00:00' }),
    ];

    // When
    const result = computeTotalSeries(expenses, rangeOfMay2024(), 'day', NOW);

    // Then: both contribute (uncategorized included in total)
    expect(result.total).toBe(150);
    expect(result.points[0]).toBe(150);
  });

  it('should OR-propagate `approx` across contributors', () => {
    // Given: one approx, one exact
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 100, approx: false }),
      fakeExpense({ id: 'b', amount: 50, approx: true }),
    ];

    // When
    const result = computeTotalSeries(expenses, rangeOfMay2024(), 'month', NOW);

    // Then
    expect(result.approx).toBe(true);
  });

  it('should keep `approx=false` when all contributors are exact', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 100, approx: false }),
      fakeExpense({ id: 'b', amount: 50, approx: false }),
    ];

    // When
    const result = computeTotalSeries(expenses, rangeOfMay2024(), 'month', NOW);

    // Then
    expect(result.approx).toBe(false);
    expect(result.total).toBe(150);
  });

  it('should return all-zero points and `approx=false` for an empty input', () => {
    // Given
    const range = rangeOfMay2024();

    // When
    const result = computeTotalSeries([], range, 'day', NOW);

    // Then: buckets still enumerated (so the sparkline shows a flat line)
    expect(result.buckets.length).toBeGreaterThan(0);
    expect(result.points.every((p) => p === 0)).toBe(true);
    expect(result.total).toBe(0);
    expect(result.approx).toBe(false);
  });

  it('should clamp `range.to` to end-of-today', () => {
    // Given: future-extending range + future expense
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'past', amount: 100, date: '2024-05-10T10:00:00' }),
      fakeExpense({ id: 'future', amount: 999, date: '2024-05-20T10:00:00' }),
    ];

    // When
    const result = computeTotalSeries(expenses, rangeOfMay2024(), 'day', NOW);

    // Then
    expect(result.total).toBe(100);
    expect(result.buckets).toHaveLength(15);
  });
});
