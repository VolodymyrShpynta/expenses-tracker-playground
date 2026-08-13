import { describe, expect, it } from 'vitest';

import {
  buildCategoryUsage,
  sortCategories,
  type CategoryUsage,
} from './categoryOrder';
import type { ExpenseProjection } from './types';

function expense(
  categoryId: string | undefined,
  updatedAt: number,
): ExpenseProjection {
  return {
    id: `e-${categoryId ?? 'none'}-${updatedAt}`,
    amount: 100,
    currency: 'CZK',
    updatedAt,
    deleted: false,
    ...(categoryId !== undefined ? { categoryId } : {}),
  };
}

/** Stand-in for the Intl.Collator the picker binds to the active language. */
const compareName = (a: string, b: string): number => a.localeCompare(b, 'en');

const rows = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
  { id: 'c', name: 'Charlie' },
];

describe('buildCategoryUsage', () => {
  it('counts expenses per category', () => {
    const usage = buildCategoryUsage([
      expense('a', 1),
      expense('a', 2),
      expense('b', 3),
    ]);
    expect(usage.get('a')?.count).toBe(2);
    expect(usage.get('b')?.count).toBe(1);
  });

  it('keeps the latest write as lastUsedAt regardless of input order', () => {
    const usage = buildCategoryUsage([
      expense('a', 500),
      expense('a', 100),
      expense('a', 300),
    ]);
    expect(usage.get('a')?.lastUsedAt).toBe(500);
  });

  it('ignores expenses with no category', () => {
    const usage = buildCategoryUsage([expense(undefined, 1), expense('a', 2)]);
    expect(usage.size).toBe(1);
    expect(usage.has('a')).toBe(true);
  });
});

describe('sortCategories', () => {
  const usage = new Map<string, CategoryUsage>([
    ['b', { count: 5, lastUsedAt: 10 }],
    ['c', { count: 1, lastUsedAt: 99 }],
  ]);

  it('orders alphabetically', () => {
    const sorted = sortCategories(rows, 'alpha', usage, compareName);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders by count, most used first', () => {
    const sorted = sortCategories(rows, 'used', usage, compareName);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders by recency, most recent first', () => {
    const sorted = sortCategories(rows, 'recent', usage, compareName);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('falls back to the name when usage ties', () => {
    const tied = new Map<string, CategoryUsage>([
      ['c', { count: 2, lastUsedAt: 1 }],
      ['a', { count: 2, lastUsedAt: 1 }],
    ]);
    expect(sortCategories(rows, 'used', tied, compareName).map((r) => r.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('degrades to alphabetical when nothing has been used yet', () => {
    const empty = new Map<string, CategoryUsage>();
    for (const mode of ['used', 'recent'] as const) {
      expect(sortCategories(rows, mode, empty, compareName).map((r) => r.id)).toEqual([
        'a',
        'b',
        'c',
      ]);
    }
  });

  it('does not mutate the input', () => {
    const input = [...rows].reverse();
    const snapshot = input.map((r) => r.id);
    sortCategories(input, 'alpha', usage, compareName);
    expect(input.map((r) => r.id)).toEqual(snapshot);
  });
});
