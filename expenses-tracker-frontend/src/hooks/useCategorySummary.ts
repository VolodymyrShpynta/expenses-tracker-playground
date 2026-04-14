import { useMemo } from 'react';
import type { Expense, CategorySummary } from '../types/expense.ts';
import { ALL_CATEGORY_NAMES } from '../utils/categoryConfig.ts';

interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Derives per-category totals from a list of expenses, optionally filtered
 * by date range. Sorted descending by total amount.
 * All canonical categories appear even with zero spending in the range.
 * Categories from expenses that are not in the canonical list also appear.
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

    // Seed all canonical categories so they always appear
    for (const cat of ALL_CATEGORY_NAMES) {
      map.set(cat, { total: 0, count: 0 });
    }

    // Seed any user-created categories not in the canonical list
    for (const e of expenses) {
      if (!map.has(e.category)) {
        map.set(e.category, { total: 0, count: 0 });
      }
    }

    for (const e of filtered) {
      const entry = map.get(e.category)!;
      entry.total += e.amount;
      entry.count += 1;
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
