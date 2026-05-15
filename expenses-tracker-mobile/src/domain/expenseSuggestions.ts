/**
 * Pure description-suggestion filter — no React, no React Native.
 *
 * Lives in `domain/` (not `hooks/`) so Vitest can exercise it without
 * importing the `useExpenses` hook chain, which transitively pulls in
 * React Native (whose Flow-typed entry point Rolldown can't parse).
 *
 * Match rule: description starts with `query` (case-insensitive, after
 * trimming both sides). Results are deduplicated by lower-cased
 * description — only the most recent occurrence of each unique phrase
 * survives, so a frequent payee like "Kaufland" surfaces its latest
 * amount/category as a single suggestion instead of N copies.
 *
 * The input is presumed to be ordered DESC by date / `updated_at`
 * (see `sqliteLocalStore.findActiveProjections`), so we can dedupe in
 * a single forward pass with a `Set` of seen keys.
 */
import type { ExpenseProjection } from './types';

/** Hard cap on how many suggestion rows to render below the input. */
export const MAX_SUGGESTIONS = 5;
/** Minimum query length before we bother filtering. */
export const MIN_QUERY_LENGTH = 2;

export function filterSuggestions(
  expenses: ReadonlyArray<ExpenseProjection>,
  query: string,
  limit: number = MAX_SUGGESTIONS,
): ReadonlyArray<ExpenseProjection> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const seen = new Set<string>();
  const out: ExpenseProjection[] = [];
  for (const expense of expenses) {
    const description = expense.description?.trim();
    if (!description) continue;
    const lower = description.toLowerCase();
    if (!lower.startsWith(trimmed)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(expense);
    if (out.length >= limit) break;
  }
  return out;
}
