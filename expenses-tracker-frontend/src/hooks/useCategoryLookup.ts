import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CategoryIcon from '@mui/icons-material/Category';
import type { SvgIconComponent } from '@mui/icons-material';
import { useCategoryCatalog } from './useCategories.ts';
import { ICON_MAP } from '../utils/categoryConfig.ts';

/**
 * Display fields resolved from a category id.
 * `name` is empty when the id is unknown (orphan reference) — callers decide
 * the display fallback.
 */
export interface ResolvedCategory {
  name: string;
  color: string;
  icon: SvgIconComponent;
}

const ORPHAN: ResolvedCategory = {
  name: '',
  color: '#78909c',
  icon: CategoryIcon,
};

export interface CategoryLookup {
  /** Resolve an id to display fields, returning a neutral default for unknown ids. */
  resolve: (categoryId: string) => ResolvedCategory;
}

/**
 * Reactive lookup of category display fields by id, backed by the same
 * TanStack Query cache as `useCategoryCatalog` (the full catalog,
 * including soft-deleted rows). Resolving from the full catalog keeps
 * historic expenses' name/icon/color stable after a category is archived
 * (e.g. by "reset to defaults").
 *
 * Templated categories (`templateKey != null`, `name == null`) are
 * resolved through the `categoryTemplates.<templateKey>` i18n namespace,
 * so a language switch automatically retranslates without any backend
 * round-trip.
 */
export function useCategoryLookup(): CategoryLookup {
  const { categories } = useCategoryCatalog();
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    const map = new Map<string, ResolvedCategory>();
    for (const c of categories) {
      const name =
        c.name ??
        (c.templateKey
          // i18next has typed keys via module augmentation; dynamic template
          // literals can't be statically narrowed, so we widen here.
          ? (t as (key: string) => string)(`categoryTemplates.${c.templateKey}`)
          : '');
      map.set(c.id, {
        name,
        color: c.color,
        icon: ICON_MAP[c.icon] ?? CategoryIcon,
      });
    }
    return {
      resolve: (id) => map.get(id) ?? ORPHAN,
    };
    // i18n.language is part of the deps so the memo recomputes on language switch
    // (the t() function reference itself is stable across renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, i18n.language]);
}
