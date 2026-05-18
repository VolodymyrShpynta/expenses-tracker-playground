/**
 * Tests for the pure-TS exchange-rate logic in `./exchangeRates.ts`.
 *
 * The React hook (`src/hooks/useExchangeRates.ts`) is intentionally not
 * tested here — Vitest scope is pure TS only (see `vitest.config.ts`).
 * All branches the hook can take are covered by exercising
 * `convertAmount` directly with hand-crafted rate maps.
 */
import { describe, expect, it } from 'vitest';

import {
  ZERO_AMOUNT,
  addAmounts,
  convertAmount,
  monthKey,
  sumAmounts,
} from './exchangeRates';
import type { ConvertedAmount, HistoricalRates, LatestRates } from './exchangeRates';

describe('monthKey', () => {
  it('buckets an ISO date string to first-of-month', () => {
    expect(monthKey('2024-01-15')).toBe('2024-01-01');
    expect(monthKey('2024-01-01')).toBe('2024-01-01');
    expect(monthKey('2024-12-31')).toBe('2024-12-01');
  });

  it('buckets a full ISO timestamp using UTC components', () => {
    // 23:59 local on Jan 31 in a +01:00 timezone is still January in UTC.
    expect(monthKey('2024-01-31T22:59:00.000Z')).toBe('2024-01-01');
    // Boundary case: midnight UTC on the first is unambiguously that month.
    expect(monthKey('2024-02-01T00:00:00.000Z')).toBe('2024-02-01');
  });

  it('pads single-digit months', () => {
    expect(monthKey('2024-03-09')).toBe('2024-03-01');
  });

  it('returns null for unparseable or empty input', () => {
    expect(monthKey(undefined)).toBeNull();
    expect(monthKey('')).toBeNull();
    expect(monthKey('not-a-date')).toBeNull();
  });
});

describe('convertAmount', () => {
  const historical: HistoricalRates = {
    EUR: {
      '2020-01-01': 0.9, // 1 USD = 0.9 EUR in Jan 2020
      '2024-01-01': 0.92,
    },
    GBP: {
      '2024-01-01': 0.79,
    },
  };
  const latest: LatestRates = { EUR: 0.95, GBP: 0.82 };

  it('returns the amount unchanged when fromCurrency equals mainCurrency', () => {
    const result = convertAmount(1000, 'USD', 'USD', '2024-01-15', historical, latest);
    expect(result).toEqual({ amount: 1000, approx: false });
  });

  it('uses the historical rate for the expense month when available', () => {
    // 100 EUR in Jan 2020 → 100 / 0.9 = 111.11 USD → 11111 cents
    const result = convertAmount(10000, 'EUR', 'USD', '2020-01-15', historical, latest);
    expect(result).toEqual({ amount: 11111, approx: false });
  });

  it('buckets the date to its month — last-day-of-month uses that month rate', () => {
    const result = convertAmount(10000, 'EUR', 'USD', '2024-01-31', historical, latest);
    // Should pick 2024-01-01 rate (0.92), not the latest 0.95
    expect(result.amount).toBe(Math.round(10000 / 0.92));
    expect(result.approx).toBe(false);
  });

  it('falls back to the latest rate when no historical rate covers the month', () => {
    // Feb 2024 — no row in `historical`
    const result = convertAmount(10000, 'EUR', 'USD', '2024-02-15', historical, latest);
    expect(result.amount).toBe(Math.round(10000 / 0.95));
    expect(result.approx).toBe(true);
  });

  it('falls back to latest rate when expense has no date', () => {
    const result = convertAmount(10000, 'EUR', 'USD', undefined, historical, latest);
    expect(result.amount).toBe(Math.round(10000 / 0.95));
    expect(result.approx).toBe(true);
  });

  it('returns the raw amount and approx=true when neither historical nor latest is known', () => {
    const result = convertAmount(10000, 'RUB', 'USD', '2024-01-15', historical, latest);
    expect(result).toEqual({ amount: 10000, approx: true });
  });

  it('returns the raw amount and approx=true when latest rates are entirely missing', () => {
    const result = convertAmount(10000, 'EUR', 'USD', '2024-02-15', historical, undefined);
    expect(result).toEqual({ amount: 10000, approx: true });
  });

  it('treats a zero or negative rate as missing and falls back', () => {
    const broken: HistoricalRates = { EUR: { '2024-01-01': 0 } };
    const result = convertAmount(10000, 'EUR', 'USD', '2024-01-15', broken, latest);
    expect(result.amount).toBe(Math.round(10000 / 0.95));
    expect(result.approx).toBe(true);
  });
});

describe('ZERO_AMOUNT', () => {
  it('is the additive identity (exact, zero cents)', () => {
    expect(ZERO_AMOUNT).toEqual({ amount: 0, approx: false });
  });
});

describe('addAmounts', () => {
  it('sums cents and ORs the approx flags', () => {
    const a: ConvertedAmount = { amount: 1000, approx: false };
    const b: ConvertedAmount = { amount: 250, approx: false };
    expect(addAmounts(a, b)).toEqual({ amount: 1250, approx: false });
  });

  it('propagates approx=true from either side', () => {
    const exact: ConvertedAmount = { amount: 1000, approx: false };
    const fuzzy: ConvertedAmount = { amount: 250, approx: true };
    expect(addAmounts(exact, fuzzy).approx).toBe(true);
    expect(addAmounts(fuzzy, exact).approx).toBe(true);
  });

  it('keeps approx=false when both sides are exact', () => {
    expect(
      addAmounts(
        { amount: 1, approx: false },
        { amount: 2, approx: false },
      ),
    ).toEqual({ amount: 3, approx: false });
  });

  it('treats ZERO_AMOUNT as the identity element', () => {
    const a: ConvertedAmount = { amount: 777, approx: true };
    expect(addAmounts(ZERO_AMOUNT, a)).toEqual(a);
    expect(addAmounts(a, ZERO_AMOUNT)).toEqual(a);
  });
});

describe('sumAmounts', () => {
  it('returns ZERO_AMOUNT for an empty iterable', () => {
    expect(sumAmounts([])).toEqual(ZERO_AMOUNT);
  });

  it('sums a list of exact amounts to an exact total', () => {
    const items: ConvertedAmount[] = [
      { amount: 100, approx: false },
      { amount: 200, approx: false },
      { amount: 50, approx: false },
    ];
    expect(sumAmounts(items)).toEqual({ amount: 350, approx: false });
  });

  it('flags the total approx=true when any contributor is approx', () => {
    const items: ConvertedAmount[] = [
      { amount: 100, approx: false },
      { amount: 200, approx: true },
      { amount: 50, approx: false },
    ];
    expect(sumAmounts(items)).toEqual({ amount: 350, approx: true });
  });

  it('works with any iterable, not just arrays', () => {
    function* gen(): Generator<ConvertedAmount> {
      yield { amount: 10, approx: false };
      yield { amount: 20, approx: true };
    }
    expect(sumAmounts(gen())).toEqual({ amount: 30, approx: true });
  });
});
