/**
 * Exchange-rate hook — historical-aware conversion to the user's
 * `mainCurrency`.
 *
 * Earlier versions converted everything at today's rate (live fetch from
 * open.er-api.com), which silently distorted long-range totals when FX
 * drifted over years. This version reads from the local
 * `exchange_rates` cache (populated by `useExchangeRatesSync`) and picks
 * the monthly rate that applied during each expense's month, falling
 * back to the most recent live rate with an `approx=true` flag when the
 * exact-month rate is unavailable.
 *
 * The hook keeps its single TanStack Query keyed on `mainCurrency`; the
 * sync hook invalidates it after persisting new rows.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ExpenseProjection } from '../domain/types';
import { useMainCurrency } from '../context/preferencesProvider';
import { useExchangeRateStore } from '../db/databaseProvider';
import { EXCHANGE_RATES_QUERY_KEY } from '../queryClient';
import { convertAmount } from '../domain/exchangeRates';
import type {
  ConvertedAmount,
  HistoricalRates,
  LatestRates,
} from '../domain/exchangeRates';

interface RateBundle {
  readonly historical: HistoricalRates;
  readonly latest: LatestRates;
}

/** `ExpenseProjection` plus the conversion approximation flag. */
export interface ConvertedExpenseProjection extends ExpenseProjection {
  readonly approx: boolean;
}

export function useExchangeRates() {
  const { mainCurrency } = useMainCurrency();
  const store = useExchangeRateStore();

  const { data } = useQuery<RateBundle>({
    queryKey: [...EXCHANGE_RATES_QUERY_KEY, mainCurrency],
    queryFn: async () => ({
      historical: await store.findHistoricalRates(mainCurrency),
      latest: await store.findLatestRates(mainCurrency),
    }),
    // Cache lives in SQLite; in-memory copy can survive a long while.
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  /**
   * Convert `amount` (cents in `fromCurrency`) to cents in `mainCurrency`,
   * using the rate that applied at `date`. Returns `{ amount, approx }`
   * — `approx` is true whenever we had to fall back to today's rate.
   */
  const convert = useCallback(
    (amount: number, fromCurrency: string, date?: string): ConvertedAmount =>
      convertAmount(
        amount,
        fromCurrency,
        mainCurrency,
        date,
        data?.historical ?? {},
        data?.latest,
      ),
    [data, mainCurrency],
  );

  return { convert, mainCurrency, ratesLoaded: !!data };
}

/**
 * Returns expenses with `amount` converted to `mainCurrency` and a new
 * `approx` flag indicating whether the conversion used the live fallback
 * rate instead of an exact monthly rate.
 */
export function useConvertedExpenses(
  expenses: ReadonlyArray<ExpenseProjection>,
): ReadonlyArray<ConvertedExpenseProjection> {
  const { convert } = useExchangeRates();
  return useMemo(
    () =>
      expenses.map((e) => {
        const { amount, approx } = convert(e.amount, e.currency, e.date);
        return { ...e, amount, approx };
      }),
    [expenses, convert],
  );
}
