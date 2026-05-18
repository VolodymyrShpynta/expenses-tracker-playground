/**
 * Per-category aggregation, optionally filtered by date range — port of
 * `expenses-tracker-frontend/src/hooks/useCategorySummary.ts`.
 *
 * Thin React wrapper over the pure [`computeCategorySummary`](../domain/categorySummary.ts)
 * function. The split keeps the bucketing logic exercisable from
 * Vitest without React's renderer and mirrors the
 * [`exchangeRates.ts`](../domain/exchangeRates.ts) /
 * [`useExchangeRates`](./useExchangeRates.ts) pattern.
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

import type { DateRange } from '../utils/dateRange';
import {
  computeCategorySummary,
  type CategorySummaryResult,
  type MaybeApprox,
} from '../domain/categorySummary';

export type { CategorySummary, MaybeApprox } from '../domain/categorySummary';

export function useCategorySummary(
  expenses: ReadonlyArray<MaybeApprox>,
  dateRange?: DateRange,
): CategorySummaryResult {
  return useMemo(
    () => computeCategorySummary(expenses, dateRange),
    [expenses, dateRange],
  );
}
