import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Expense } from '../types/expense';
import { useMainCurrency } from './useCurrency';

const BASE_URL = 'https://open.er-api.com/v6/latest';

interface ExchangeRateResponse {
  result: string;
  rates: Record<string, number>;
}

async function fetchRates(base: string): Promise<Record<string, number>> {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(base)}`);
  if (!res.ok) throw new Error(`Exchange rate fetch failed: ${res.status}`);
  const data: ExchangeRateResponse = await res.json();
  if (data.result !== 'success') throw new Error('Exchange rate API error');
  return data.rates;
}

/**
 * Fetches exchange rates for the user's main currency and provides
 * a helper to convert any expense amount to the main currency.
 * Rates are cached for 1 hour via TanStack Query.
 */
export function useExchangeRates() {
  const { mainCurrency } = useMainCurrency();

  const { data: rates } = useQuery({
    queryKey: ['exchange-rates', mainCurrency],
    queryFn: () => fetchRates(mainCurrency),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000,
  });

  /** Convert cents in `fromCurrency` to cents in mainCurrency */
  const convert = useCallback((amount: number, fromCurrency: string) => {
    if (fromCurrency === mainCurrency) return amount;
    if (!rates) return amount;
    // rates maps mainCurrency -> other, so we need the inverse
    const rate = rates[fromCurrency];
    if (!rate) return amount;
    return Math.round(amount / rate);
  }, [rates, mainCurrency]);

  return { convert, mainCurrency, ratesLoaded: !!rates };
}

/**
 * Converts an array of expenses to the main currency for aggregation.
 * Returns a new array with `amount` converted; original data untouched.
 */
export function useConvertedExpenses(expenses: Expense[]): Expense[] {
  const { convert } = useExchangeRates();
  return useMemo(
    () => expenses.map((e) => ({ ...e, amount: convert(e.amount, e.currency) })),
    [expenses, convert],
  );
}
