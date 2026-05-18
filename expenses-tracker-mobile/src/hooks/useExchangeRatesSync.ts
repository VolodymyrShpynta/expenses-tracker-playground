/**
 * Exchange-rate sync — keeps the local `exchange_rates` cache covered for
 * the months our expenses span, against the user's `mainCurrency`.
 *
 * Strategy:
 *   1. Compute the set of distinct `(currency, monthKey)` tuples present
 *      in the user's expenses, excluding rows already in `mainCurrency`.
 *   2. Cross-reference against the cache to find missing months per
 *      currency, then pick the earliest missing month across all
 *      currencies as the `from=` parameter for one batched
 *      `/v2/rates?group=month` request. Slight over-fetching here keeps
 *      the HTTP call count at exactly one per sync.
 *   3. Also keep the `LATEST` sentinel rows fresh (max once every
 *      `LATEST_FRESH_MS`) so the conversion fallback works offline after
 *      the first online run.
 *   4. Invalidate `EXCHANGE_RATES_QUERY_KEY` only when rows were
 *      written, so steady-state renders do not loop the effect.
 *
 * Mount once near the top of the React tree — see `app/_layout.tsx`.
 *
 * Failure handling: any fetch / SQL error is logged and swallowed.
 * The next mount, currency change, or expenses update will retry. The
 * UI continues working with whatever rates are already cached, and the
 * `approx=true` flag surfaces the uncertainty inline.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useMainCurrency } from '../context/preferencesProvider';
import { useExchangeRateStore } from '../db/databaseProvider';
import { LATEST_PERIOD } from '../db/exchangeRateStore';
import type { ExchangeRateRow, ExchangeRateStore } from '../db/exchangeRateStore';
import { monthKey } from '../domain/exchangeRates';
import { fetchLatestRates, fetchMonthlySeries } from '../api/exchangeRates';
import { EXCHANGE_RATES_QUERY_KEY } from '../queryClient';
import type { ExpenseProjection } from '../domain/types';
import { useExpenses } from './useExpenses';

/** Refresh the live fallback rates at most once every 24 hours. */
const LATEST_FRESH_MS = 24 * 60 * 60 * 1000;

interface MissingMonths {
  readonly earliest: string | null;
  readonly quotes: ReadonlyArray<string>;
}

async function findMissingMonths(
  base: string,
  expenses: ReadonlyArray<ExpenseProjection>,
  store: ExchangeRateStore,
): Promise<MissingMonths> {
  // Group expense monthKeys per non-main quote currency.
  const byQuote = new Map<string, Set<string>>();
  for (const e of expenses) {
    if (e.currency === base) continue;
    const mk = monthKey(e.date);
    if (mk === null) continue;
    const months = byQuote.get(e.currency) ?? new Set<string>();
    months.add(mk);
    byQuote.set(e.currency, months);
  }

  let earliest: string | null = null;
  const missingQuotes: string[] = [];
  for (const [quote, months] of byQuote) {
    const covered = await store.findCoveredMonths(base, quote);
    let anyMissing = false;
    for (const m of months) {
      if (!covered.has(m)) {
        anyMissing = true;
        if (earliest === null || m < earliest) earliest = m;
      }
    }
    if (anyMissing) missingQuotes.push(quote);
  }
  return { earliest, quotes: missingQuotes };
}

/** Returns the number of rows written (history + latest). */
async function syncOnce(
  base: string,
  expenses: ReadonlyArray<ExpenseProjection>,
  store: ExchangeRateStore,
): Promise<number> {
  let written = 0;

  // ----- 1. Historical monthly rates -----
  const { earliest, quotes } = await findMissingMonths(base, expenses, store);
  if (earliest !== null && quotes.length > 0) {
    const series = await fetchMonthlySeries(base, earliest, quotes);
    const now = Date.now();
    const rows: ExchangeRateRow[] = [];
    for (const r of series) {
      const periodStart = monthKey(r.date);
      if (periodStart === null) continue;
      rows.push({
        base: r.base,
        quote: r.quote,
        periodStart,
        rate: r.rate,
        fetchedAt: now,
      });
    }
    if (rows.length > 0) {
      await store.upsertRates(rows);
      written += rows.length;
    }
  }

  // ----- 2. Live fallback rates (gated by 24h freshness) -----
  const lastFetched = await store.findLatestFetchedAt(base);
  const stale = lastFetched === null || Date.now() - lastFetched > LATEST_FRESH_MS;
  if (stale) {
    const latest = await fetchLatestRates(base);
    const now = Date.now();
    const latestRows: ExchangeRateRow[] = latest.map((r) => ({
      base: r.base,
      quote: r.quote,
      periodStart: LATEST_PERIOD,
      rate: r.rate,
      fetchedAt: now,
    }));
    if (latestRows.length > 0) {
      await store.upsertRates(latestRows);
      written += latestRows.length;
    }
  }

  return written;
}

export function useExchangeRatesSync(): void {
  const { mainCurrency } = useMainCurrency();
  const store = useExchangeRateStore();
  const { expenses } = useExpenses();
  const queryClient = useQueryClient();

  // Single-flight lock. Prevents concurrent runs (StrictMode remount,
  // rapid expense edits). Nullable because the dependency array re-fires
  // the effect on every relevant change — we just need to ensure only
  // one in-flight task at a time.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (expenses.length === 0) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const written = await syncOnce(mainCurrency, expenses, store);
        if (!cancelled && written > 0) {
          await queryClient.invalidateQueries({ queryKey: EXCHANGE_RATES_QUERY_KEY });
        }
      } catch (e) {
        // Network outage, API hiccup, SQLite hiccup — log and move on.
        // The next mount / currency change will retry naturally.
        console.warn('useExchangeRatesSync: refresh failed', e);
      } finally {
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mainCurrency, expenses, store, queryClient]);
}
