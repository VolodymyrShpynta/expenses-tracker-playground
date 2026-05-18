/**
 * Pure-TS exchange-rate logic — no React, no React Native imports.
 *
 * Historical conversion picks the rate that was in effect *during the
 * month the expense was incurred*, not today's rate. This matters most
 * for long-range overviews where FX drift across years would otherwise
 * silently distort totals.
 *
 * The conversion direction matches the upstream Frankfurter / open.er-api
 * convention: for base=USD, quote=EUR, rate=R means "1 USD buys R EUR".
 * Converting an EUR-denominated `amount` back to USD therefore divides:
 *   usdAmount = eurAmount / R
 *
 * All conversions return an `approx` flag so the UI can mark totals that
 * fell back to today's live rate (offline first run, currency outside
 * the historical dataset, etc.). The same rule propagates through any
 * downstream aggregation: a category total is approximate if *any*
 * contributing expense was approximate.
 */

/** Conversion outcome — `approx=true` when we used the fallback latest rate. */
export interface ConvertedAmount {
  /** Converted amount in cents (`mainCurrency` units). */
  readonly amount: number;
  /** True when a historical rate was unavailable and we used the latest one. */
  readonly approx: boolean;
}

/** Identity element for `addAmounts` / `sumAmounts`. */
export const ZERO_AMOUNT: ConvertedAmount = { amount: 0, approx: false };

/**
 * Combine two converted amounts: cents add, `approx` flags OR.
 *
 * The rule is unidirectional — once any contributor is approximate the
 * aggregate is approximate, and there is no way to "un-approximate" it.
 * Keep callers from re-implementing this and accidentally using `&&`.
 */
export function addAmounts(a: ConvertedAmount, b: ConvertedAmount): ConvertedAmount {
  return { amount: a.amount + b.amount, approx: a.approx || b.approx };
}

/**
 * Sum any iterable of converted amounts. Empty input returns `ZERO_AMOUNT`
 * (`{ amount: 0, approx: false }`) — an empty selection is exact by
 * definition, not approximate.
 */
export function sumAmounts(items: Iterable<ConvertedAmount>): ConvertedAmount {
  let amount = 0;
  let approx = false;
  for (const item of items) {
    amount += item.amount;
    approx = approx || item.approx;
  }
  return { amount, approx };
}

/**
 * Map of historical monthly rates for one `base` currency:
 *   `historicalRates[quoteCurrency][monthKey] = rate`
 *
 * `monthKey` is the canonical "YYYY-MM-01" string returned by `monthKey()`.
 */
export type HistoricalRates = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** Map of latest live rates for the same `base`: `latestRates[quoteCurrency] = rate`. */
export type LatestRates = Readonly<Record<string, number>>;

/**
 * Normalize any date-like string ("2024-01-15", "2024-01-15T08:30:00Z", …)
 * to its month bucket "YYYY-MM-01". Returns `null` for missing / unparsable
 * input so callers can decide whether to treat that as an `approx` fallback.
 *
 * Uses UTC components so the bucket does not jitter across timezones —
 * an expense saved at 23:59 local on the last of the month must not land
 * in the next month's bucket on a phone that switched timezones since.
 */
export function monthKey(input: string | undefined | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

/**
 * Convert a cents amount from `fromCurrency` to `mainCurrency` using the
 * monthly historical rate that applied at `date`.
 *
 * Fallback chain (each step sets `approx=true`):
 *   1. Same currency — no conversion, `approx=false`.
 *   2. Historical monthly rate for `(fromCurrency, monthKey(date))` — exact, `approx=false`.
 *   3. Latest live rate for `fromCurrency` — `approx=true`.
 *   4. No rate at all — return raw amount, `approx=true`.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  mainCurrency: string,
  date: string | undefined,
  historicalRates: HistoricalRates,
  latestRates: LatestRates | undefined,
): ConvertedAmount {
  if (fromCurrency === mainCurrency) {
    return { amount, approx: false };
  }
  const key = monthKey(date);
  const monthly = key ? historicalRates[fromCurrency]?.[key] : undefined;
  if (typeof monthly === 'number' && monthly > 0) {
    return { amount: Math.round(amount / monthly), approx: false };
  }
  const latest = latestRates?.[fromCurrency];
  if (typeof latest === 'number' && latest > 0) {
    return { amount: Math.round(amount / latest), approx: true };
  }
  // No rate available at all — return the raw amount but flag approximate
  // so the UI can warn the user (matches the pre-historical-rates behaviour
  // when the live-rates endpoint was unreachable).
  return { amount, approx: true };
}
