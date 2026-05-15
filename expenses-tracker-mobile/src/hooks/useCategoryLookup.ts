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
 *
 * Self-healing: a templated row whose stored `name` accidentally matches
 * the template translation in *any* supported locale is treated as
 * frozen-by-mistake (older builds of the edit form persisted the
 * displayed translation on icon-only edits) and re-translated to the
 * current locale. Real user customizations almost never collide with a
 * canonical template label, so the false-positive risk is low and the
 * outcome (showing the correct localized template name) is what the
 * user wanted anyway.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useCategoryCatalog } from './useCategories';
import { getMaterialIconName, type MaterialIconName } from '../utils/categoryConfig';
import { ORPHAN_CATEGORY_COLOR } from '../domain/defaultCategories';
import { SUPPORTED_LANGUAGES } from '../i18n';

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
    /**
     * Translations of `categoryTemplates.<templateKey>` across every
     * supported language. Used to detect a stored name that's actually
     * a frozen template label (see file header).
     *
     * Cached per template key so repeated catalog rows don't re-walk the
     * full language list.
     */
    const templateTranslationsCache = new Map<string, ReadonlyArray<string>>();
    const getTemplateTranslations = (templateKey: string): ReadonlyArray<string> => {
      const cached = templateTranslationsCache.get(templateKey);
      if (cached) return cached;
      const key = `categoryTemplates.${templateKey}`;
      const translations = SUPPORTED_LANGUAGES.map((l) =>
        (i18n.t as (k: string, opts: { lng: string }) => string)(key, { lng: l.code }),
      );
      templateTranslationsCache.set(templateKey, translations);
      return translations;
    };

    const resolveTemplatedName = (templateKey: string, storedName?: string): string => {
      const localized = (translate as (key: string) => string)(
        `categoryTemplates.${templateKey}`,
      );
      if (storedName == null) return localized;
      // If the stored name matches the template label in any supported
      // language, treat it as a freeze artifact and prefer the live
      // translation.
      const known = getTemplateTranslations(templateKey);
      return known.includes(storedName) ? localized : storedName;
    };

    const map = new Map<string, ResolvedCategory>();
    for (const c of categories) {
      const name = c.templateKey
        ? resolveTemplatedName(c.templateKey, c.name)
        : (c.name ?? '');
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
