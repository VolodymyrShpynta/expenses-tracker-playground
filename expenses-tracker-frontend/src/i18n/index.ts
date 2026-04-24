/**
 * i18n bootstrap.
 *
 * - Uses `react-i18next` bindings with `i18next-browser-languagedetector`.
 * - Detection order: explicit user choice in localStorage → `navigator.language`.
 * - The selected language is persisted under `LANGUAGE_STORAGE_KEY`.
 * - Dayjs locale is kept in sync with the active i18n language so that
 *   `dayjs().format(…)` calls output localized month / weekday names.
 *
 * Import this file once from `main.tsx` (side-effectful). Components consume
 * translations through `useTranslation()` from `react-i18next`.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/uk';
import 'dayjs/locale/cs';

import en from './locales/en.json';
import uk from './locales/uk.json';
import cs from './locales/cs.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const LANGUAGE_STORAGE_KEY = 'expenses-tracker-language';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      uk: { translation: uk },
      cs: { translation: cs },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    // Strip region (e.g. "en-US" → "en") so navigator.language maps to a supported code.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

// Keep dayjs in sync with i18n. Dayjs locale codes match i18n codes we ship.
const applyDayjsLocale = (lng: string) => {
  const base = lng.split('-')[0];
  dayjs.locale(base);
};

// Keep the document's `<html lang>` attribute in sync with the active language.
// Screen readers, search engines, and the browser's spell-checker all read this
// attribute to pick the correct pronunciation / dictionary.
const applyHtmlLang = (lng: string) => {
  document.documentElement.lang = lng.split('-')[0];
};

applyDayjsLocale(i18n.language);
applyHtmlLang(i18n.language);
i18n.on('languageChanged', (lng) => {
  applyDayjsLocale(lng);
  applyHtmlLang(lng);
});

export default i18n;
