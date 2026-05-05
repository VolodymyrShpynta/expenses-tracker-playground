/**
 * Formats cents to a localized human-readable amount string.
 * Example (en): 501276 → "5,012.76"; (cs): "5 012,76"
 */
import { getLocale } from '../i18n/locale';

export function formatAmount(cents: number): string {
  const value = cents / 100;
  return value.toLocaleString(getLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats cents with a currency code prefix.
 * Example (en, CZK): "CZK 5,012.76"
 */
export function formatAmountWithCurrency(cents: number, currency: string): string {
  return `${currency} ${formatAmount(cents)}`;
}

/**
 * Formats cents as compact currency (no decimals for large values) in the active locale.
 */
export function formatAmountCompact(cents: number): string {
  const value = Math.round(cents / 100);
  return value.toLocaleString(getLocale());
}

/**
 * Formats cents as compact currency with a currency code prefix.
 */
export function formatAmountCompactWithCurrency(cents: number, currency: string): string {
  return `${currency} ${formatAmountCompact(cents)}`;
}
