import { useMemo } from 'react';
import type { Expense, CategorySummary } from '../types/expense.ts';

interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Derives per-category totals from a list of expenses, optionally filtered
 * by date range. Sorted descending by total amount.
 *
 * Groups strictly by `categoryId`. Display fields (name/color/icon) are
 * resolved by the caller via `useCategoryLookup`, which keeps this hook free of
 * UI concerns and avoids duplicating the resolution path.
 */
export function useCategorySummary(
  expenses: Expense[],
  dateRange?: DateRange,
): { categories: CategorySummary[]; grandTotal: number } {
  return useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const filtered = dateRange
      ? expenses.filter((e) => {
          const d = new Date(e.date);
          const effectiveTo = dateRange.to > today ? today : dateRange.to;
          return d >= dateRange.from && d <= effectiveTo;
        })
      : expenses;

    const map = new Map<string, { total: number; count: number }>();

    // Seed every id referenced by any expense (in or out of date range) so
    // empty-period categories still appear when desired.
    for (const e of expenses) {
      if (!map.has(e.categoryId)) {
        map.set(e.categoryId, { total: 0, count: 0 });
      }
    }

    for (const e of filtered) {
      const entry = map.get(e.categoryId)!;
      entry.total += e.amount;
      entry.count += 1;
    }

    const grandTotal = filtered.reduce((sum, e) => sum + e.amount, 0);

    const result: CategorySummary[] = Array.from(map.entries())
      .map(([categoryId, { total, count }]) => ({
        categoryId,
        total,
        count,
        percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { categories: result, grandTotal };
  }, [expenses, dateRange]);
}
