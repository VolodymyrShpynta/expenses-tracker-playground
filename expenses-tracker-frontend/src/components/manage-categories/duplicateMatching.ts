import type { Category } from '../../types/category.ts';

/**
 * Pure helpers for detecting same-named custom categories. Lives outside
 * the component so the rules can be reasoned about (and tested) without
 * pulling in React or i18n.
 */

/**
 * Custom categories that match a given input name (case- and whitespace-
 * insensitive). Templated rows are intentionally excluded — the seeder
 * owns their lifecycle.
 *
 * - `active` is the (single) live row with that name, if any.
 * - `archived` is every soft-deleted row with that name, sorted with the
 *   most recently used first — [0] is the canonical row to restore.
 */
export interface NameMatches {
  active: Category | null;
  archived: Category[];
}

/** Case-insensitive, whitespace-trimmed normalisation for duplicate detection. */
export const normalizeName = (s: string) => s.trim().toLocaleLowerCase();

/**
 * Find every custom category in `catalog` whose name collides with
 * `rawName`. Returns `null` when the input is empty/whitespace or no
 * customs match — i.e. when the caller can proceed with a plain create.
 */
export function findDuplicateCustoms(
  catalog: Category[],
  rawName: string,
): NameMatches | null {
  const needle = normalizeName(rawName);
  if (!needle) return null;
  const matches = catalog.filter(
    (c) => c.templateKey == null && c.name != null && normalizeName(c.name) === needle,
  );
  if (matches.length === 0) return null;
  return {
    active: matches.find((c) => !c.deleted) ?? null,
    archived: matches
      .filter((c) => c.deleted)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  };
}
