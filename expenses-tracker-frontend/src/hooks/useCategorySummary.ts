import { useMemo } from 'react';
import type { Expense, CategorySummary } from '../types/expense.ts';

interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Derives per-category totals from a list of expenses, optionally filtered
 * by date range. Sorted descending by total amount.
 */
export function useCategorySummary(
  expenses: Expense[],
  dateRange?: DateRange,
): { categories: CategorySummary[]; grandTotal: number } {
  return useMemo(() => {
    const filtered = dateRange
      ? expenses.filter((e) => {
          const d = new Date(e.date);
          return d >= dateRange.from && d <= dateRange.to;
        })
      : expenses;

    const map = new Map<string, { total: number; count: number }>();

    for (const e of filtered) {
      const entry = map.get(e.category) ?? { total: 0, count: 0 };
      entry.total += e.amount;
      entry.count += 1;
      map.set(e.category, entry);
    }

    const grandTotal = filtered.reduce((sum, e) => sum + e.amount, 0);

    const categories: CategorySummary[] = Array.from(map.entries())
      .map(([category, { total, count }]) => ({
        category,
        total,
        count,
        percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { categories, grandTotal };
  }, [expenses, dateRange]);
}
