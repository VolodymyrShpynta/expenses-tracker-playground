/**
 * Tests for `format.ts` — currency / amount formatters and the
 * locale-tolerant `parseAmount` used by the keypad.
 *
 * Locale is passed in explicitly (the module stays pure / RN-free) so we
 * pin `en-US` for predictable separators in every assertion. The
 * `~` prefix used by the `approx` flag is the
 * `APPROX_PREFIX` constant — assertions reference it directly so a
 * future change to the marker glyph fails the test deliberately.
 */
import { describe, expect, it } from 'vitest';

import {
  APPROX_PREFIX,
  formatAmount,
  formatAmountCompact,
  formatAmountCompactIfLarge,
  formatAmountCompactWithCurrency,
  formatAmountWithCurrency,
  formatConvertedAmount,
  formatConvertedAmountCompact,
  formatTotalCompactWithCurrency,
  parseAmount,
} from './format';

const LOCALE = 'en-US';

describe('formatAmount', () => {
  it('should render integer cents as a fixed 2-decimal value', () => {
    // Given: 1234 cents
    // When/Then
    expect(formatAmount(1234, LOCALE)).toBe('12.34');
  });

  it('should pad single-digit minor units with a trailing zero', () => {
    // Given: 12 dollars 50 cents (1250) and 12 dollars 5 cents (1205)
    // When/Then
    expect(formatAmount(1250, LOCALE)).toBe('12.50');
    expect(formatAmount(1205, LOCALE)).toBe('12.05');
  });

  it('should render zero as "0.00"', () => {
    expect(formatAmount(0, LOCALE)).toBe('0.00');
  });

  it('should render negative values with a leading sign', () => {
    expect(formatAmount(-1234, LOCALE)).toBe('-12.34');
  });
});

describe('formatAmountWithCurrency', () => {
  it('should prefix the currency code without the approx marker when approx=false', () => {
    // When/Then
    expect(formatAmountWithCurrency(1234, 'USD', LOCALE)).toBe('USD 12.34');
    expect(formatAmountWithCurrency(1234, 'USD', LOCALE, false)).toBe('USD 12.34');
  });

  it('should prefix the approx marker when approx=true', () => {
    // When/Then
    expect(formatAmountWithCurrency(1234, 'USD', LOCALE, true)).toBe(
      `${APPROX_PREFIX}USD 12.34`,
    );
  });
});

describe('formatAmountCompact', () => {
  it('should round to whole units (no decimals)', () => {
    // Given: 1234 cents rounds to $12; 1267 rounds to $13
    expect(formatAmountCompact(1234, LOCALE)).toBe('12');
    expect(formatAmountCompact(1267, LOCALE)).toBe('13');
  });

  it('should round half-up at exactly 50 cents', () => {
    // Given: 1250 cents (exactly half) rounds away from zero
    expect(formatAmountCompact(1250, LOCALE)).toBe('13');
  });
});

describe('formatAmountCompactWithCurrency', () => {
  it('should combine compact rounding with currency + approx prefix', () => {
    // When/Then
    expect(formatAmountCompactWithCurrency(1234, 'EUR', LOCALE)).toBe('EUR 12');
    expect(formatAmountCompactWithCurrency(1234, 'EUR', LOCALE, true)).toBe(
      `${APPROX_PREFIX}EUR 12`,
    );
  });
});

describe('formatConvertedAmount', () => {
  it('should format a non-approx ConvertedAmount without the marker', () => {
    // Given: a ConvertedAmount value object that did *not* fall back
    // When/Then
    expect(formatConvertedAmount({ amount: 1234, approx: false }, 'USD', LOCALE)).toBe(
      'USD 12.34',
    );
  });

  it('should prefix the marker when the ConvertedAmount is approx', () => {
    // Given: a ConvertedAmount that used the live fallback rate
    // When/Then
    expect(formatConvertedAmount({ amount: 1234, approx: true }, 'USD', LOCALE)).toBe(
      `${APPROX_PREFIX}USD 12.34`,
    );
  });
});

describe('formatConvertedAmountCompact', () => {
  it('should apply both compact rounding and the approx prefix', () => {
    // When/Then
    expect(
      formatConvertedAmountCompact({ amount: 1234, approx: false }, 'USD', LOCALE),
    ).toBe('USD 12');
    expect(
      formatConvertedAmountCompact({ amount: 1234, approx: true }, 'USD', LOCALE),
    ).toBe(`${APPROX_PREFIX}USD 12`);
  });
});

describe('formatTotalCompactWithCurrency', () => {
  it('rounds cents (no suffix) for totals below the threshold', () => {
    // 12,345.67 units → rounded whole number, no cents, no suffix
    expect(formatTotalCompactWithCurrency(1_234_567, 'USD', LOCALE)).toBe('USD 12,346');
  });

  it('scales large totals to millions with up to 3 decimals', () => {
    // 10,123,345 units → 10.123M
    expect(formatTotalCompactWithCurrency(1_012_334_500, 'UAH', LOCALE)).toBe('UAH 10.123M');
    // 123,345,000 units → 123.345M
    expect(formatTotalCompactWithCurrency(12_334_500_000, 'UAH', LOCALE)).toBe('UAH 123.345M');
  });

  it('steps up to B for billions', () => {
    // 10,123,345,000 units → 10.123B
    expect(formatTotalCompactWithCurrency(1_012_334_500_000, 'UAH', LOCALE)).toBe('UAH 10.123B');
  });

  it('keeps the approx prefix on a compacted total', () => {
    // 5,000,000 units → 5M
    expect(formatTotalCompactWithCurrency(500_000_000, 'USD', LOCALE, true)).toBe(
      `${APPROX_PREFIX}USD 5M`,
    );
  });
});

describe('formatAmountCompactIfLarge', () => {
  it('keeps cents for amounts below the threshold', () => {
    // 11,990.66 units → exact, with cents
    expect(formatAmountCompactIfLarge(1_199_066, 'USD', LOCALE)).toBe('USD 11,990.66');
  });

  it('scales large amounts (M/B) like the total formatter', () => {
    // 10,000,000 units → 10M
    expect(formatAmountCompactIfLarge(1_000_000_000, 'UAH', LOCALE)).toBe('UAH 10M');
  });
});

describe('parseAmount', () => {
  it('should parse a dot-separated decimal as cents', () => {
    expect(parseAmount('12.50')).toBe(1250);
  });

  it('should parse a comma-separated decimal as cents (locale tolerance)', () => {
    // Given: continental-European decimal separator
    // When/Then
    expect(parseAmount('12,50')).toBe(1250);
  });

  it('should parse a bare integer as whole units (no minor)', () => {
    expect(parseAmount('12')).toBe(1200);
  });

  it('should round half-up at the cent boundary', () => {
    // Given: a sub-cent fraction
    // When/Then
    expect(parseAmount('12.345')).toBe(1235);
  });

  it('should trim surrounding whitespace', () => {
    expect(parseAmount('  12.50  ')).toBe(1250);
  });

  it('should return null for empty / whitespace-only input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
  });

  it('should return null for non-numeric input', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12abc')).toBeNull();
  });

  it('should return null for negative values', () => {
    // Given: the keypad never produces negatives; reject the input
    expect(parseAmount('-1')).toBeNull();
    expect(parseAmount('-12.50')).toBeNull();
  });

  it('should handle a leading-dot decimal like "0.5"', () => {
    // Given: ".5"
    expect(parseAmount('.5')).toBe(50);
  });
});
