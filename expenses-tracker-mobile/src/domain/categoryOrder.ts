/**
 * Ordering for category *choosers* — the picker and the transactions filter.
 *
 * Deliberately not applied to the Overview breakdown or the Categories
 * screen: those are rankings, and they're meaningfully ordered by amount.
 *
 * Alphabetical can't be done in SQL. A built-in category's display name is
 * translated at render time from `categoryTemplates.<templateKey>`, so the
 * name the user reads doesn't exist in the database — sorting has to happen
 * on the resolved name, and has to re-run when the language changes.
 */
import type { ExpenseProjection } from './types';

export type CategorySortMode = 'alpha' | 'used' | 'recent';

export interface CategoryUsage {
  readonly count: number;
  /** Epoch ms of the most recent expense written against the category. */
  readonly lastUsedAt: number;
}

export interface SortableCategory {
  readonly id: string;
  readonly name: string;
}

/**
 * Usage tallied from the expense list the app already caches, rather than a
 * `GROUP BY` — the whole active set is one warm query, and this saves adding
 * a second source of truth that could disagree with it.
 *
 * Recency uses `updatedAt` (when the expense was written), not `date` (which
 * the user picks and can backdate): "recently used" is about what the user
 * last reached for, not about when the money was spent.
 */
export function buildCategoryUsage(
  expenses: ReadonlyArray<ExpenseProjection>,
): ReadonlyMap<string, CategoryUsage> {
  const usage = new Map<string, CategoryUsage>();
  for (const expense of expenses) {
    const id = expense.categoryId;
    if (id === undefined) continue;
    const previous = usage.get(id);
    usage.set(id, {
      count: (previous?.count ?? 0) + 1,
      lastUsedAt: Math.max(previous?.lastUsedAt ?? 0, expense.updatedAt),
    });
  }
  return usage;
}

/**
 * `compareName` comes from an `Intl.Collator` bound to the active language:
 * comparing with `<` orders by code point, which mis-sorts diacritics (Czech
 * `Č` belongs after `C`, not after `Z`) and splits mixed Cyrillic/Latin lists.
 *
 * Every mode falls back to the name, so a fresh install with no expenses —
 * where every count is 0 — still gets a stable, sensible list instead of an
 * arbitrary one.
 */
export function sortCategories<T extends SortableCategory>(
  rows: ReadonlyArray<T>,
  mode: CategorySortMode,
  usage: ReadonlyMap<string, CategoryUsage>,
  compareName: (a: string, b: string) => number,
): ReadonlyArray<T> {
  const byName = (a: T, b: T) => compareName(a.name, b.name);
  const sorted = [...rows];
  if (mode === 'alpha') {
    return sorted.sort(byName);
  }
  const rank = (row: T): number => {
    const entry = usage.get(row.id);
    if (entry === undefined) return 0;
    return mode === 'used' ? entry.count : entry.lastUsedAt;
  };
  return sorted.sort((a, b) => rank(b) - rank(a) || byName(a, b));
}
