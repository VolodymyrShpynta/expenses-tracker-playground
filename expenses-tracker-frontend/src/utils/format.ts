/**
 * Formats cents to a human-readable currency string.
 * Example: 501276 → "5,012.76"
 */
export function formatAmount(cents: number): string {
  const value = cents / 100;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats cents as compact currency (no decimals for large values).
 * Example: 501276 → "5,013"
 */
export function formatAmountCompact(cents: number): string {
  const value = Math.round(cents / 100);
  return value.toLocaleString('en-US');
}

/**
 * Returns a short month-year label from an ISO date string.
 * Example: "2025-03-15T10:00:00Z" → "Mar 2025"
 */
export function formatMonthYear(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
