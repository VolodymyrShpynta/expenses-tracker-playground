/**
 * Per-category aggregation, optionally filtered by date range — port of
 * `expenses-tracker-frontend/src/hooks/useCategorySummary.ts`.
 *
 * Display fields (name, color, icon) are resolved by the caller via
 * `useCategoryLookup` — same separation the web frontend uses.
 */
import { useMemo } from 'react';

import type { ExpenseProjection } from '../domain/types';
import type { DateRange } from '../utils/dateRange';

export interface CategorySummary {
  readonly categoryId: string;
  readonly total: number;
  readonly count: number;
  readonly percentage: number;
}

export function useCategorySummary(
  expenses: ReadonlyArray<ExpenseProjection>,
  dateRange?: DateRange,
): { categories: CategorySummary[]; grandTotal: number } {
  return useMemo(() => {
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23, 59, 59, 999,
    );

    const filtered = dateRange
      ? expenses.filter((e) => {
          if (!e.date) return false;
          const d = new Date(e.date);
          const effectiveTo = dateRange.to > today ? today : dateRange.to;
          return d >= dateRange.from && d <= effectiveTo;
        })
      : expenses;

    // Single pass over the in-range subset. Categories with no activity
    // in the selected period are intentionally omitted from the result —
    // callers used to filter `c.total > 0` after the fact, which is now
    // unnecessary but harmless.
    const map = new Map<string, { total: number; count: number }>();
    for (const e of filtered) {
      const key = e.categoryId ?? '';
      const entry = map.get(key);
      if (entry) {
        entry.total += e.amount;
        entry.count += 1;
      } else {
        map.set(key, { total: e.amount, count: 1 });
      }
    }

    const grandTotal = filtered.reduce((sum, e) => sum + e.amount, 0);

    const categories: CategorySummary[] = Array.from(map.entries())
      .filter(([key]) => key !== '')
      .map(([categoryId, { total, count }]) => ({
        categoryId,
        total,
        count,
        percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { categories, grandTotal };
  }, [expenses, dateRange]);
}
