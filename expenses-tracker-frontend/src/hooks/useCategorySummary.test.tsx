import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Expense } from '../types/expense';
import { useCategorySummary } from './useCategorySummary';

function expense(partial: Partial<Expense> & { id: string; categoryId: string; amount: number; date: string }): Expense {
  return {
    description: '',
    currency: 'USD',
    updatedAt: 0,
    deleted: false,
    ...partial,
  };
}

describe('useCategorySummary', () => {
  it('groups by categoryId and sorts by total descending', () => {
    const expenses = [
      expense({ id: '1', categoryId: 'food', amount: 1000, date: '2026-01-10T00:00:00Z' }),
      expense({ id: '2', categoryId: 'food', amount: 500, date: '2026-01-11T00:00:00Z' }),
      expense({ id: '3', categoryId: 'travel', amount: 2500, date: '2026-01-12T00:00:00Z' }),
    ];

    const { result } = renderHook(() => useCategorySummary(expenses));

    expect(result.current.grandTotal).toBe(4000);
    expect(result.current.categories.map((c) => c.categoryId)).toEqual(['travel', 'food']);
    expect(result.current.categories[0]).toMatchObject({
      categoryId: 'travel',
      total: 2500,
      count: 1,
      percentage: 62.5,
    });
    expect(result.current.categories[1]).toMatchObject({
      categoryId: 'food',
      total: 1500,
      count: 2,
      percentage: 37.5,
    });
  });

  it('returns zero percentages when grandTotal is 0', () => {
    const { result } = renderHook(() => useCategorySummary([]));
    expect(result.current.grandTotal).toBe(0);
    expect(result.current.categories).toEqual([]);
  });

  it('filters expenses by date range while still seeding empty-period categories', () => {
    const expenses = [
      expense({ id: '1', categoryId: 'food', amount: 1000, date: '2026-01-15T00:00:00Z' }),
      expense({ id: '2', categoryId: 'travel', amount: 2000, date: '2026-02-15T00:00:00Z' }),
    ];

    const { result } = renderHook(() =>
      useCategorySummary(expenses, {
        from: new Date(2026, 0, 1),
        to: new Date(2026, 0, 31, 23, 59, 59, 999),
      }),
    );

    // grandTotal includes only January expenses
    expect(result.current.grandTotal).toBe(1000);

    // Both category ids are seeded but only food has a positive total
    const food = result.current.categories.find((c) => c.categoryId === 'food');
    const travel = result.current.categories.find((c) => c.categoryId === 'travel');
    expect(food).toMatchObject({ total: 1000, count: 1, percentage: 100 });
    expect(travel).toMatchObject({ total: 0, count: 0, percentage: 0 });
  });

  it('clamps the upper bound of the date range to today (no future double-counting)', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const expenses = [
      expense({ id: '1', categoryId: 'food', amount: 1000, date: today.toISOString() }),
      expense({ id: '2', categoryId: 'food', amount: 9999, date: tomorrow.toISOString() }),
    ];

    // dateRange.to is far in the future — should be clamped to end-of-today
    const farFuture = new Date(today);
    farFuture.setFullYear(today.getFullYear() + 5);

    const { result } = renderHook(() =>
      useCategorySummary(expenses, { from: new Date(2000, 0, 1), to: farFuture }),
    );

    expect(result.current.grandTotal).toBe(1000);
  });
});
