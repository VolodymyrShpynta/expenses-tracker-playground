/**
 * Per-category aggregation, optionally filtered by date range — port of
 * `expenses-tracker-frontend/src/hooks/useCategorySummary.ts`.
 *
 * Display fields (name, color, icon) are resolved by the caller via
 * `useCategoryLookup` — same separation the web frontend uses.
 *
 * When called with `ConvertedExpenseProjection` rows (the usual path),
 * each `CategorySummary.total` and the `grandTotal` carry the `approx`
 * flag as part of a `ConvertedAmount` value object: `approx=true` when
 * *any* contributing expense was converted using the live fallback rate.
 * See `src/domain/exchangeRates.ts`.
 */
import { useMemo } from 'react';

import type { ExpenseProjection } from '../domain/types';
import type { DateRange } from '../utils/dateRange';
import {
  ZERO_AMOUNT,
  addAmounts,
  type ConvertedAmount,
} from '../domain/exchangeRates';

/** Optional `approx` field — present on `ConvertedExpenseProjection`. */
type MaybeApprox = ExpenseProjection & { readonly approx?: boolean };

export interface CategorySummary {
  readonly categoryId: string;
  /** Per-category total, paired with the `approx` propagation flag. */
  readonly total: ConvertedAmount;
  readonly count: number;
  readonly percentage: number;
}

export function useCategorySummary(
  expenses: ReadonlyArray<MaybeApprox>,
  dateRange?: DateRange,
): { categories: CategorySummary[]; grandTotal: ConvertedAmount } {
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
    // callers used to filter `c.total.amount > 0` after the fact, which
    // is now unnecessary but harmless.
    const map = new Map<string, { total: ConvertedAmount; count: number }>();
    let grandTotal: ConvertedAmount = ZERO_AMOUNT;
    for (const e of filtered) {
      const contribution: ConvertedAmount = {
        amount: e.amount,
        approx: e.approx === true,
      };
      grandTotal = addAmounts(grandTotal, contribution);
      const key = e.categoryId ?? '';
      const entry = map.get(key);
      if (entry) {
        entry.total = addAmounts(entry.total, contribution);
        entry.count += 1;
      } else {
        map.set(key, { total: contribution, count: 1 });
      }
    }

    const categories: CategorySummary[] = Array.from(map.entries())
      .filter(([key]) => key !== '')
      .map(([categoryId, entry]) => ({
        categoryId,
        total: entry.total,
        count: entry.count,
        percentage:
          grandTotal.amount > 0 ? (entry.total.amount / grandTotal.amount) * 100 : 0,
      }))
      .sort((a, b) => b.total.amount - a.total.amount);

    return { categories, grandTotal };
  }, [expenses, dateRange]);
}
