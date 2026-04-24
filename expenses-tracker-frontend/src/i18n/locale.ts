/**
 * Locale helpers shared across the frontend.
 *
 * Two pieces of advice that drive the split below:
 *
 *  - **In React components** that need to re-render when the language
 *    changes (e.g. anything formatting a date for display), pull `i18n`
 *    from `useTranslation()` so the component subscribes to language
 *    updates, then read `i18n.resolvedLanguage` (or use
 *    {@link resolveLanguage} for a safe fallback chain).
 *
 *  - **In plain utility functions** outside the React tree (formatters,
 *    `Intl` helpers, fetch wrappers), call {@link getLocale} — it reads
 *    the same value but doesn't require a component context.
 */
import type { i18n as I18nInstance } from 'i18next';
import i18n from './index';

const DEFAULT_LANGUAGE = 'en';

/**
 * Resolve the active language code (`"en" | "uk" | "cs"`) from any
 * i18next instance. Always strips region subtags ("uk-UA" → "uk") so
 * the result is safe to use as a key into our locale-keyed maps.
 */
export function resolveLanguage(instance: I18nInstance): string {
  const raw = instance.resolvedLanguage ?? instance.language ?? DEFAULT_LANGUAGE;
  return raw.split('-')[0];
}

/**
 * Returns the active locale BCP-47 code (e.g. `"en"`) for use with the
 * `Intl` APIs (`Date.prototype.toLocaleDateString`, `Number.prototype.toLocaleString`)
 * outside of React components.
 */
export function getLocale(): string {
  return resolveLanguage(i18n);
}
