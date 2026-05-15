/**
 * Description-based autocomplete over the local expense projection.
 *
 * Pure derivation on top of {@link useExpenses} — no SQL, no debounce.
 * The cached `['expenses']` query already contains every active
 * projection, and on a phone the row count stays in the low thousands,
 * so client-side filtering is plenty fast and avoids a second query
 * key (which would invalidate on every write and re-run the SQL).
 *
 * The actual filter is the pure {@link filterSuggestions} function in
 * `domain/expenseSuggestions.ts` — kept there (rather than next to
 * the hook) so Vitest can unit-test it without dragging React Native
 * in through the `useExpenses` import chain.
 */
import { useMemo } from 'react';

import { useExpenses } from './useExpenses';
import { filterSuggestions } from '../domain/expenseSuggestions';
import type { ExpenseProjection } from '../domain/types';

// Re-export so existing call sites can keep importing from this module.
export {
  filterSuggestions,
  MAX_SUGGESTIONS,
  MIN_QUERY_LENGTH,
} from '../domain/expenseSuggestions';

export interface UseExpenseSuggestionsOptions {
  readonly enabled?: boolean;
}

/**
 * React hook variant — wires {@link filterSuggestions} to the cached
 * expense projection. `options.enabled` short-circuits to an empty
 * array (useful while editing an existing expense, or before the user
 * has typed anything since the form was seeded).
 */
export function useExpenseSuggestions(
  query: string,
  options: UseExpenseSuggestionsOptions = {},
): ReadonlyArray<ExpenseProjection> {
  const { enabled = true } = options;
  const { expenses } = useExpenses();
  return useMemo(
    () => (enabled ? filterSuggestions(expenses, query) : []),
    [enabled, expenses, query],
  );
}
