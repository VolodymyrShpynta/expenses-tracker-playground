/**
 * Currency / amount formatting helpers — port of
 * `expenses-tracker-frontend/src/utils/format.ts`.
 *
 * Amounts are stored as integer cents; these helpers divide by 100 and
 * format using the active i18next language (passed in by the caller so
 * this module stays pure / testable).
 */

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
): string {
  return `${currency} ${formatAmount(cents, locale)}`;
}

export function formatAmountCompact(cents: number, locale: string): string {
  const value = Math.round(cents / 100);
  return value.toLocaleString(locale);
}

export function formatAmountCompactWithCurrency(
  cents: number,
  currency: string,
  locale: string,
): string {
  return `${currency} ${formatAmountCompact(cents, locale)}`;
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
