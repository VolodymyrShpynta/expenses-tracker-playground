/**
 * Currency / amount formatting helpers — port of
 * `expenses-tracker-frontend/src/utils/format.ts`.
 *
 * Amounts are stored as integer cents; these helpers divide by 100 and
 * format using the active i18next language (passed in by the caller so
 * this module stays pure / testable).
 *
 * Two flavors:
 *   - `format{Amount,AmountCompact}WithCurrency` take primitive cents and
 *     are used for raw original-currency rendering (the source-of-truth
 *     amount on an expense row, suggestion list, etc.).
 *   - `formatConvertedAmount{,Compact}` take a `ConvertedAmount` value
 *     object (cents + `approx` flag) and are used wherever the displayed
 *     value is the result of currency conversion (totals, per-category
 *     rollups, donut centre, section headers). The `~` prefix is applied
 *     automatically when `approx === true`.
 */

import type { ConvertedAmount } from '../domain/exchangeRates';

/**
 * Prefix used to mark amounts whose conversion fell back to the live
 * FX rate (no historical month rate available). Centralized here so the
 * marker can be changed in one place. See `src/domain/exchangeRates.ts`
 * for the conversion contract.
 */
export const APPROX_PREFIX = '~';

export function formatAmount(cents: number, locale: string): string {
  const value = cents / 100;
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatAmountWithCurrency(
  cents: number,
  currency: string,
  locale: string,
  approx = false,
): string {
  return `${approx ? APPROX_PREFIX : ''}${currency} ${formatAmount(cents, locale)}`;
}

export function formatAmountCompact(cents: number, locale: string): string {
  const value = Math.round(cents / 100);
  return value.toLocaleString(locale);
}

export function formatAmountCompactWithCurrency(
  cents: number,
  currency: string,
  locale: string,
  approx = false,
): string {
  return `${approx ? APPROX_PREFIX : ''}${currency} ${formatAmountCompact(cents, locale)}`;
}

/**
 * Format a `ConvertedAmount` (value object pairing cents + `approx`).
 * Prefer this over manually unpacking `.amount` / `.approx` at the call
 * site — keeping them together is the whole point of the value type.
 */
export function formatConvertedAmount(
  amount: ConvertedAmount,
  currency: string,
  locale: string,
): string {
  return formatAmountWithCurrency(amount.amount, currency, locale, amount.approx);
}

/** Compact variant of {@link formatConvertedAmount} (integer cents, no decimals). */
export function formatConvertedAmountCompact(
  amount: ConvertedAmount,
  currency: string,
  locale: string,
): string {
  return formatAmountCompactWithCurrency(amount.amount, currency, locale, amount.approx);
}

/**
 * Parse a user-typed amount string ("12,50" / "12.50" / "12") into
 * integer cents. Returns `null` for invalid / empty input. Locale-tolerant
 * (accepts both `,` and `.` as decimal separator).
 */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
