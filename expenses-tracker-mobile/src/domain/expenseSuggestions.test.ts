/**
 * Pure-filter tests for description-based expense suggestions.
 *
 * Covers the `filterSuggestions` helper that powers the
 * `useExpenseSuggestions` hook. The helper is defined in `domain/`
 * (not `hooks/`) so Vitest can import it without dragging in React
 * Native through the `useExpenses` hook chain.
 */
import { describe, expect, it } from 'vitest';

import {
  filterSuggestions,
  MAX_SUGGESTIONS,
  MIN_QUERY_LENGTH,
} from './expenseSuggestions';
import type { ExpenseProjection } from './types';

function expense(
  overrides: Partial<ExpenseProjection> & Pick<ExpenseProjection, 'id'>,
): ExpenseProjection {
  return {
    amount: 1000,
    currency: 'USD',
    updatedAt: 1,
    deleted: false,
    ...overrides,
  };
}

describe('filterSuggestions', () => {
  it('returns empty array for an empty query', () => {
    const rows = [expense({ id: 'a', description: 'Kaufland' })];
    expect(filterSuggestions(rows, '')).toEqual([]);
  });

  it('returns empty array when the trimmed query is shorter than MIN_QUERY_LENGTH', () => {
    expect(MIN_QUERY_LENGTH).toBeGreaterThan(0);
    const rows = [expense({ id: 'a', description: 'Kaufland' })];
    const short = 'K'.repeat(MIN_QUERY_LENGTH - 1);
    expect(filterSuggestions(rows, short)).toEqual([]);
    // Trims before measuring.
    expect(filterSuggestions(rows, `  ${short}  `)).toEqual([]);
  });

  it('matches case-insensitively on the description prefix', () => {
    const rows = [
      expense({ id: 'a', description: 'Kaufland' }),
      expense({ id: 'b', description: 'Lidl' }),
      expense({ id: 'c', description: 'KAUFHOF' }),
    ];
    const ids = filterSuggestions(rows, 'kauf').map((e) => e.id);
    expect(ids).toEqual(['a', 'c']);
  });

  it('does not match substrings that are not at the start', () => {
    const rows = [
      expense({ id: 'a', description: 'Mini Kaufland trip' }),
      expense({ id: 'b', description: 'Kaufland' }),
    ];
    expect(filterSuggestions(rows, 'Kauf').map((e) => e.id)).toEqual(['b']);
  });

  it('deduplicates by lower-cased description and keeps the first (most recent) occurrence', () => {
    // The input is presumed pre-sorted DESC by date — `findActiveProjections`
    // does this — so the first hit of each unique description is the
    // most recent one. The filter must preserve that ordering.
    const rows = [
      expense({ id: 'new', description: 'Kaufland', amount: 5000, updatedAt: 30 }),
      expense({ id: 'old', description: 'kaufland', amount: 1000, updatedAt: 10 }),
      expense({ id: 'mid', description: 'Kaufland ', amount: 2000, updatedAt: 20 }),
    ];
    const result = filterSuggestions(rows, 'Kauf');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('new');
  });

  it('ignores empty / whitespace-only descriptions', () => {
    const rows = [
      expense({ id: 'a', description: '' }),
      expense({ id: 'b', description: '   ' }),
      expense({ id: 'c' }),                              // undefined
      expense({ id: 'd', description: 'Kaufland' }),
    ];
    expect(filterSuggestions(rows, 'Kauf').map((e) => e.id)).toEqual(['d']);
  });

  it('caps the result at MAX_SUGGESTIONS unique matches', () => {
    const rows: ExpenseProjection[] = [];
    for (let i = 0; i < MAX_SUGGESTIONS + 3; i += 1) {
      rows.push(expense({ id: `e-${i}`, description: `Kaufland branch ${i}` }));
    }
    const result = filterSuggestions(rows, 'Kauf');
    expect(result).toHaveLength(MAX_SUGGESTIONS);
    expect(result.map((e) => e.id)).toEqual(
      rows.slice(0, MAX_SUGGESTIONS).map((e) => e.id),
    );
  });

  it('respects a custom limit parameter', () => {
    const rows: ExpenseProjection[] = [
      expense({ id: 'a', description: 'Kaufland A' }),
      expense({ id: 'b', description: 'Kaufland B' }),
      expense({ id: 'c', description: 'Kaufland C' }),
    ];
    expect(filterSuggestions(rows, 'Kauf', 2).map((e) => e.id)).toEqual(['a', 'b']);
  });
});
