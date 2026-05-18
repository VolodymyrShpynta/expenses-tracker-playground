/**
 * Tests for the pure `computeCategorySummary` aggregator. The React
 * wrapper (`useCategorySummary`) is intentionally not exercised here —
 * its only responsibility is `useMemo` plumbing, which is covered by
 * end-to-end tests in `pages/Categories.test.tsx` (TODO if missing).
 */
import { describe, expect, it } from 'vitest';

import { computeCategorySummary, type MaybeApprox } from './categorySummary';
import { ZERO_AMOUNT } from './exchangeRates';
import type { DateRange } from '../utils/dateRange';

const NOW = new Date(2024, 4, 15, 12, 0, 0); // 15 May 2024 noon local

// Factory input — explicitly permits `undefined` on the optional fields
// (the test suite uses `field: undefined` to opt out of factory
// defaults, which `exactOptionalPropertyTypes` would otherwise forbid).
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
  // Build the object conditionally so that "opt-out" fields (date /
  // categoryId set to `undefined`) are *omitted* rather than set to
  // `undefined` — `exactOptionalPropertyTypes` forbids the latter.
  const base = {
    id: over.id,
    amount: over.amount ?? 100,
    currency: over.currency ?? 'USD',
    description: over.description ?? '',
    updatedAt: over.updatedAt ?? 0,
    deleted: over.deleted ?? false,
    approx: over.approx ?? false,
  };
  const date: string | undefined = 'date' in over ? over.date : '2024-05-15T10:00:00';
  const categoryId: string | undefined =
    'categoryId' in over ? over.categoryId : 'cat-a';
  return {
    ...base,
    ...(date !== undefined ? { date } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
  };
}

describe('computeCategorySummary', () => {
  it('should return empty categories and a zero grand total for empty input', () => {
    // When
    const result = computeCategorySummary([]);

    // Then
    expect(result.categories).toEqual([]);
    expect(result.grandTotal).toEqual(ZERO_AMOUNT);
  });

  it('should attribute 100 % to a single category when there is only one', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 100, categoryId: 'cat-a' }),
    ];

    // When
    const result = computeCategorySummary(expenses);

    // Then
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]!.percentage).toBe(100);
    expect(result.categories[0]!.total.amount).toBe(100);
    expect(result.grandTotal.amount).toBe(100);
  });

  it('should split two equal categories 50/50', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 100, categoryId: 'cat-a' }),
      fakeExpense({ id: 'b', amount: 100, categoryId: 'cat-b' }),
    ];

    // When
    const result = computeCategorySummary(expenses);

    // Then
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]!.percentage).toBe(50);
    expect(result.categories[1]!.percentage).toBe(50);
    expect(result.grandTotal.amount).toBe(200);
  });

  it('should sort categories by total descending', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 100, categoryId: 'cat-small' }),
      fakeExpense({ id: 'b', amount: 500, categoryId: 'cat-big' }),
      fakeExpense({ id: 'c', amount: 250, categoryId: 'cat-medium' }),
    ];

    // When
    const result = computeCategorySummary(expenses);

    // Then
    expect(result.categories.map((c) => c.categoryId)).toEqual([
      'cat-big',
      'cat-medium',
      'cat-small',
    ]);
  });

  it('should return percentage=0 (not NaN) when grand total is zero', () => {
    // Given: two expenses that net to zero
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 0, categoryId: 'cat-a' }),
    ];

    // When
    const result = computeCategorySummary(expenses);

    // Then
    expect(result.categories[0]!.percentage).toBe(0);
    expect(Number.isNaN(result.categories[0]!.percentage)).toBe(false);
  });

  it('should OR-propagate `approx` from any contributing expense onto the category and grand total', () => {
    // Given: cat-a is approx, cat-b is exact
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a1', amount: 100, categoryId: 'cat-a', approx: false }),
      fakeExpense({ id: 'a2', amount: 100, categoryId: 'cat-a', approx: true }),
      fakeExpense({ id: 'b1', amount: 100, categoryId: 'cat-b', approx: false }),
    ];

    // When
    const result = computeCategorySummary(expenses);

    // Then
    const a = result.categories.find((c) => c.categoryId === 'cat-a')!;
    const b = result.categories.find((c) => c.categoryId === 'cat-b')!;
    expect(a.total.approx).toBe(true);
    expect(b.total.approx).toBe(false);
    expect(result.grandTotal.approx).toBe(true);
  });

  it('should omit categories with no in-range activity', () => {
    // Given: 3 expenses; only `b` falls in the range
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', categoryId: 'cat-a', date: '2024-04-01T10:00:00' }),
      fakeExpense({ id: 'b', categoryId: 'cat-b', date: '2024-05-10T10:00:00' }),
      fakeExpense({ id: 'c', categoryId: 'cat-c', date: '2024-06-01T10:00:00' }),
    ];
    const range: DateRange = {
      from: new Date(2024, 4, 1, 0, 0, 0),
      to: new Date(2024, 4, 31, 23, 59, 59, 999),
    };

    // When
    const result = computeCategorySummary(expenses, range, NOW);

    // Then: only cat-b survives
    expect(result.categories.map((c) => c.categoryId)).toEqual(['cat-b']);
  });

  it('should clamp the upper bound of dateRange to "now"', () => {
    // Given: range that extends past "now" (15 May noon)
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'past', categoryId: 'cat-a', date: '2024-05-10T10:00:00' }),
      fakeExpense({ id: 'future', categoryId: 'cat-b', date: '2024-05-20T10:00:00' }),
    ];
    const range: DateRange = {
      from: new Date(2024, 4, 1, 0, 0, 0),
      to: new Date(2024, 4, 31, 23, 59, 59, 999), // end of May, future relative to NOW
    };

    // When: NOW is 15 May noon → 20 May is in the future → must be clamped out
    const result = computeCategorySummary(expenses, range, NOW);

    // Then: only the past expense made it through
    expect(result.categories.map((c) => c.categoryId)).toEqual(['cat-a']);
  });

  it('should include expenses falling exactly on the from-boundary', () => {
    // Given: expense at the exact lower bound
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'edge', categoryId: 'cat-a', date: '2024-05-01T00:00:00' }),
    ];
    const range: DateRange = {
      from: new Date(2024, 4, 1, 0, 0, 0),
      to: new Date(2024, 4, 14, 23, 59, 59, 999),
    };

    // When
    const result = computeCategorySummary(expenses, range, NOW);

    // Then
    expect(result.categories).toHaveLength(1);
  });

  it('should drop expenses without a date field when a dateRange is provided', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', categoryId: 'cat-a', date: undefined }),
    ];
    const range: DateRange = {
      from: new Date(2024, 4, 1, 0, 0, 0),
      to: new Date(2024, 4, 31, 23, 59, 59, 999),
    };

    // When
    const result = computeCategorySummary(expenses, range, NOW);

    // Then
    expect(result.categories).toEqual([]);
    expect(result.grandTotal).toEqual(ZERO_AMOUNT);
  });

  it('should keep undated expenses when no dateRange is provided', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 100, categoryId: 'cat-a', date: undefined }),
    ];

    // When
    const result = computeCategorySummary(expenses);

    // Then
    expect(result.categories).toHaveLength(1);
    expect(result.grandTotal.amount).toBe(100);
  });

  it('should exclude expenses with no categoryId from the per-category bucketing but still count them in grand total', () => {
    // Given
    const expenses: MaybeApprox[] = [
      fakeExpense({ id: 'a', amount: 100, categoryId: 'cat-a' }),
      fakeExpense({ id: 'b', amount: 50, categoryId: undefined }),
    ];

    // When
    const result = computeCategorySummary(expenses);

    // Then: grand total reflects both; categories array shows only cat-a
    expect(result.categories.map((c) => c.categoryId)).toEqual(['cat-a']);
    expect(result.grandTotal.amount).toBe(150);
  });
});
