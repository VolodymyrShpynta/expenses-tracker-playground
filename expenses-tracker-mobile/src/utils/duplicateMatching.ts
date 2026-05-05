/**
 * Pure helpers for detecting same-named custom categories. Mobile port
 * of `expenses-tracker-frontend/src/components/manage-categories/duplicateMatching.ts`.
 *
 * Used by `CategoryFormDialog` to warn before creating a duplicate name —
 * either to use the existing active row, restore an archived one, or
 * create anyway.
 */
import type { Category } from '../domain/types';

export interface NameMatches {
  readonly active: Category | null;
  readonly archived: ReadonlyArray<Category>;
}

export const normalizeName = (s: string): string =>
  s.trim().toLocaleLowerCase();

/**
 * Find every custom category whose name collides with `rawName`. Returns
 * `null` when the input is empty or no customs match — caller can then
 * proceed with a plain create.
 */
export function findDuplicateCustoms(
  catalog: ReadonlyArray<Category>,
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
