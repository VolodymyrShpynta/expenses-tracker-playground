import { useMemo } from 'react';
import type { Category } from '../../types/category.ts';
import type { CategoryLookup } from '../../hooks/useCategoryLookup.ts';
import { normalizeName } from './duplicateMatching.ts';

/**
 * For every active row, the list of *other* catalog rows (active or
 * archived) that share its display name and still own at least one
 * active expense — i.e. rows it makes sense to absorb in one click.
 *
 * Display name resolution goes through `categoryLookup`, so a
 * Ukrainian custom row matches an archived templated `savings` row
 * and a casing-only collision (e.g. `Заощадження` vs `заощадження`)
 * is recognised as a duplicate as well.
 *
 * Active twins are symmetric: both rows surface the affordance, and
 * clicking it on either absorbs the *other* into "this".
 */
export function useArchivedSiblings(
  catalog: Category[],
  activeCategories: Category[],
  categoryLookup: CategoryLookup,
): Map<string, Category[]> {
  return useMemo(() => {
    // Skip rows whose expenses have all been migrated already
    // (`activeExpenseCount === 0`); merging them would be a no-op.
    const candidates = catalog.filter((c) => c.activeExpenseCount > 0);
    if (candidates.length === 0) return new Map<string, Category[]>();

    const byName = new Map<string, Category[]>();
    for (const candidate of candidates) {
      const key = normalizeName(categoryLookup.resolve(candidate.id).name);
      if (!key) continue;
      const list = byName.get(key);
      if (list) list.push(candidate);
      else byName.set(key, [candidate]);
    }

    const result = new Map<string, Category[]>();
    for (const active of activeCategories) {
      const key = normalizeName(categoryLookup.resolve(active.id).name);
      const group = key ? byName.get(key) : undefined;
      if (!group) continue;
      // Exclude self; everything else (active or archived) is a sibling
      // we can absorb into this row.
      const siblings = group.filter((c) => c.id !== active.id);
      if (siblings.length > 0) {
        result.set(active.id, siblings);
      }
    }
    return result;
  }, [catalog, activeCategories, categoryLookup]);
}
