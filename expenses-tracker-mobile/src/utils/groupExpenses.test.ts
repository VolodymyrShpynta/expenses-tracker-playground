/**
 * Tests for `groupExpenses.ts` — bucketing expenses into day / month /
 * year groups for the Transactions list.
 *
 * The `groupKey` / `groupLabel` helpers read `Date` components in local
 * time. The fixture dates below all use the `Y-M-DTHH:MM:SS` form
 * (without an offset) so they're parsed in the host timezone, matching
 * what the helpers themselves do — assertions on year / month / day
 * stay stable regardless of where the test runs.
 */
import { describe, expect, it } from 'vitest';

import { groupExpenses, groupKey, groupLabel } from './groupExpenses';
import type { ExpenseProjection } from '../domain/types';

const LOCALE = 'en-US';

function fakeExpense(over: Partial<ExpenseProjection> & { id: string }): ExpenseProjection {
  return {
    id: over.id,
    amount: over.amount ?? 100,
    currency: over.currency ?? 'USD',
    description: over.description ?? '',
    date: over.date ?? '2024-05-15T10:00:00',
    categoryId: over.categoryId ?? 'cat-a',
    updatedAt: over.updatedAt ?? 0,
    deleted: over.deleted ?? false,
  };
}

describe('groupKey', () => {
  const d = new Date(2024, 4, 15, 10, 0, 0); // 15 May 2024 (month index 4)

  it('should pack year / month / day for `day` granularity', () => {
    // When/Then
    expect(groupKey(d, 'day')).toBe('2024-4-15');
  });

  it('should pack year / month only for `month` granularity', () => {
    expect(groupKey(d, 'month')).toBe('2024-4');
  });

  it('should pack just the year for `year` granularity', () => {
    expect(groupKey(d, 'year')).toBe('2024');
  });

  it('should produce the same key for two different times within the same day', () => {
    // Given: morning + late-evening expenses on the same date
    const morning = new Date(2024, 4, 15, 8, 0, 0);
    const evening = new Date(2024, 4, 15, 22, 30, 0);

    // When/Then
    expect(groupKey(morning, 'day')).toBe(groupKey(evening, 'day'));
  });
});

describe('groupLabel', () => {
  const d = new Date(2024, 4, 15, 10, 0, 0);

  it('should render a non-empty uppercase day label for `day`', () => {
    // When
    const label = groupLabel(d, 'day', LOCALE);

    // Then: contains the 0-padded day-of-month and is uppercased
    expect(label).toContain('15');
    expect(label).toBe(label.toUpperCase());
  });

  it('should render an uppercase month-year label for `month`', () => {
    // When
    const label = groupLabel(d, 'month', LOCALE);

    // Then
    expect(label).toContain('2024');
    expect(label).toBe(label.toUpperCase());
  });

  it('should render just the year for `year`', () => {
    expect(groupLabel(d, 'year', LOCALE)).toBe('2024');
  });
});

describe('groupExpenses', () => {
  it('should return an empty array for empty input', () => {
    // When
    const groups = groupExpenses([], 'day', LOCALE);

    // Then
    expect(groups).toEqual([]);
  });

  it('should drop expenses with no date field', () => {
    // Given: one valid, one dateless
    const expenses: ExpenseProjection[] = [
      fakeExpense({ id: 'a', amount: 100, date: '2024-05-15T10:00:00' }),
      fakeExpense({ id: 'b', amount: 200, date: '' }),
    ];

    // When
    const groups = groupExpenses(expenses, 'day', LOCALE);

    // Then: only the dated one survives
    expect(groups).toHaveLength(1);
    expect(groups[0]!.expenses.map((e) => e.id)).toEqual(['a']);
    expect(groups[0]!.total).toBe(100);
  });

  it('should bucket two expenses on the same day into one group', () => {
    // Given
    const expenses: ExpenseProjection[] = [
      fakeExpense({ id: 'a', amount: 100, date: '2024-05-15T08:00:00' }),
      fakeExpense({ id: 'b', amount: 250, date: '2024-05-15T22:00:00' }),
    ];

    // When
    const groups = groupExpenses(expenses, 'day', LOCALE);

    // Then: one bucket, total summed
    expect(groups).toHaveLength(1);
    expect(groups[0]!.expenses.map((e) => e.id)).toEqual(['a', 'b']);
    expect(groups[0]!.total).toBe(350);
  });

  it('should preserve input order within each bucket', () => {
    // Given: a deliberately out-of-order pair on the same day
    const expenses: ExpenseProjection[] = [
      fakeExpense({ id: 'late', amount: 100, date: '2024-05-15T22:00:00' }),
      fakeExpense({ id: 'early', amount: 200, date: '2024-05-15T08:00:00' }),
    ];

    // When
    const groups = groupExpenses(expenses, 'day', LOCALE);

    // Then: the array order is preserved verbatim — caller is expected
    // to have sorted by date already
    expect(groups[0]!.expenses.map((e) => e.id)).toEqual(['late', 'early']);
  });

  it('should produce separate buckets for different days under `day` grouping', () => {
    // Given: two distinct days
    const expenses: ExpenseProjection[] = [
      fakeExpense({ id: 'a', amount: 100, date: '2024-05-15T10:00:00' }),
      fakeExpense({ id: 'b', amount: 200, date: '2024-05-16T10:00:00' }),
    ];

    // When
    const groups = groupExpenses(expenses, 'day', LOCALE);

    // Then
    expect(groups).toHaveLength(2);
    expect(groups[0]!.total).toBe(100);
    expect(groups[1]!.total).toBe(200);
  });

  it('should collapse different days within the same month under `month` grouping', () => {
    // Given: three different days, two of them in the same calendar month
    const expenses: ExpenseProjection[] = [
      fakeExpense({ id: 'a', amount: 100, date: '2024-05-01T10:00:00' }),
      fakeExpense({ id: 'b', amount: 200, date: '2024-05-31T10:00:00' }),
      fakeExpense({ id: 'c', amount: 400, date: '2024-06-01T10:00:00' }),
    ];

    // When
    const groups = groupExpenses(expenses, 'month', LOCALE);

    // Then: 2 buckets — May (300) and June (400)
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.expenses.some((e) => e.id === 'a'))!.total).toBe(300);
    expect(groups.find((g) => g.expenses.some((e) => e.id === 'c'))!.total).toBe(400);
  });

  it('should expose `key`, `label`, `date`, `total`, and `expenses` on each group', () => {
    // Given
    const expenses: ExpenseProjection[] = [
      fakeExpense({ id: 'a', amount: 100, date: '2024-05-15T10:00:00' }),
    ];

    // When
    const [group] = groupExpenses(expenses, 'day', LOCALE);

    // Then
    expect(group).toBeDefined();
    expect(typeof group!.key).toBe('string');
    expect(typeof group!.label).toBe('string');
    expect(group!.date).toBeInstanceOf(Date);
    expect(group!.total).toBe(100);
    expect(group!.expenses).toHaveLength(1);
  });
});
