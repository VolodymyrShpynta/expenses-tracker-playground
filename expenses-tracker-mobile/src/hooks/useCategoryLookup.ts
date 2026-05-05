/**
 * Reactive lookup of category display fields (name, color, icon-name) by
 * id — port of `expenses-tracker-frontend/src/hooks/useCategoryLookup.ts`.
 *
 * Resolves through the **full catalog** (including soft-deleted rows) so
 * historic expenses keep stable display fields after archival.
 *
 * Templated rows (`templateKey != null`, `name == null`) resolve their
 * label through the `categoryTemplates.<templateKey>` i18n namespace, so
 * a language switch retranslates without any data-layer round-trip.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useCategoryCatalog } from './useCategories';
import { getMaterialIconName, type MaterialIconName } from '../utils/categoryConfig';
import { ORPHAN_CATEGORY_COLOR } from '../domain/defaultCategories';

export interface ResolvedCategory {
  readonly name: string;
  readonly color: string;
  readonly iconName: MaterialIconName;
}

const ORPHAN: ResolvedCategory = {
  name: '',
  color: ORPHAN_CATEGORY_COLOR,
  iconName: 'category',
};

export interface CategoryLookup {
  resolve(categoryId: string | undefined): ResolvedCategory;
}

export function useCategoryLookup(): CategoryLookup {
  const { categories } = useCategoryCatalog();
  const { t: translate, i18n } = useTranslation();
  return useMemo(() => {
    const map = new Map<string, ResolvedCategory>();
    for (const c of categories) {
      const name =
        c.name ??
        (c.templateKey
          ? (translate as (key: string) => string)(`categoryTemplates.${c.templateKey}`)
          : '');
      map.set(c.id, {
        name,
        color: c.color,
        iconName: getMaterialIconName(c.icon),
      });
    }
    return {
      resolve: (id) => (id ? (map.get(id) ?? ORPHAN) : ORPHAN),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, i18n.language]);
}
