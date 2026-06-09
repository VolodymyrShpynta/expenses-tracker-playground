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
import 'dayjs/locale/es';
import 'dayjs/locale/de';
import 'dayjs/locale/fr';
import 'dayjs/locale/pt';
import 'dayjs/locale/it';
import 'dayjs/locale/pl';
import 'dayjs/locale/hi';
import 'dayjs/locale/id';
import 'dayjs/locale/tr';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/zh';

import en from './locales/en.json';
import uk from './locales/uk.json';
import cs from './locales/cs.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import pl from './locales/pl.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import tr from './locales/tr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zh from './locales/zh.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
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
      es: { translation: es },
      de: { translation: de },
      fr: { translation: fr },
      pt: { translation: pt },
      it: { translation: it },
      pl: { translation: pl },
      hi: { translation: hi },
      id: { translation: id },
      tr: { translation: tr },
      ja: { translation: ja },
      ko: { translation: ko },
      zh: { translation: zh },
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
