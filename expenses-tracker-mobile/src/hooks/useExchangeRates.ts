/**
 * Exchange-rate hook — mobile port of
 * `expenses-tracker-frontend/src/hooks/useExchangeRates.ts`. Same upstream
 * (open.er-api.com), same 1-hour cache, same `convert()` semantics.
 *
 * Differences vs. web:
 *   - Reads `mainCurrency` from `PreferencesProvider` (AsyncStorage-backed)
 *     instead of `useMainCurrency` from `localStorage`.
 *   - When the device is offline (`fetch` rejects), TanStack Query keeps
 *     serving the last successful payload until the cache GC fires —
 *     which gives a useful offline experience without bespoke caching.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ExpenseProjection } from '../domain/types';
import { useMainCurrency } from '../context/preferencesProvider';

const BASE_URL = 'https://open.er-api.com/v6/latest';

interface ExchangeRateResponse {
  readonly result: string;
  readonly rates: Record<string, number>;
}

async function fetchRates(base: string): Promise<Record<string, number>> {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(base)}`);
  if (!res.ok) throw new Error(`Exchange rate fetch failed: ${res.status}`);
  const data = (await res.json()) as ExchangeRateResponse;
  if (data.result !== 'success') throw new Error('Exchange rate API error');
  return data.rates;
}

export function useExchangeRates() {
  const { mainCurrency } = useMainCurrency();

  const { data: rates } = useQuery({
    queryKey: ['exchange-rates', mainCurrency],
    queryFn: () => fetchRates(mainCurrency),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  });

  /** Convert cents in `fromCurrency` to cents in `mainCurrency`. */
  const convert = useCallback(
    (amount: number, fromCurrency: string): number => {
      if (fromCurrency === mainCurrency) return amount;
      if (!rates) return amount;
      const rate = rates[fromCurrency];
      if (!rate) return amount;
      return Math.round(amount / rate);
    },
    [rates, mainCurrency],
  );

  return { convert, mainCurrency, ratesLoaded: !!rates };
}

/** Returns expenses with `amount` converted to `mainCurrency`. */
export function useConvertedExpenses(
  expenses: ReadonlyArray<ExpenseProjection>,
): ReadonlyArray<ExpenseProjection> {
  const { convert } = useExchangeRates();
  return useMemo(
    () => expenses.map((e) => ({ ...e, amount: convert(e.amount, e.currency) })),
    [expenses, convert],
  );
}
