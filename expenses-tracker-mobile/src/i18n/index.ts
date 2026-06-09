/**
 * i18n bootstrap for the mobile app.
 *
 * Mirrors `expenses-tracker-frontend/src/i18n/index.ts` in spirit but
 * adapts to React Native:
 *   - `navigator.language` → `Intl.DateTimeFormat().resolvedOptions().locale`
 *     (Hermes ships full `Intl` on RN 0.74+, so this works on iOS, Android,
 *     and the Expo web target).
 *   - `localStorage` → `AsyncStorage` (selected language is persisted).
 *
 * Locale JSON is OWNED by the mobile module — translations are independent
 * from the web frontend (different UX, different surface, different
 * mobile-only keys, so wording legitimately diverges). To add a new
 * language, copy `locales/en.json` to `locales/<lang>.json` and translate
 * in place. Intra-module key parity (every locale matches `en.json`) is
 * enforced by `scripts/check-locale-parity.mjs` via `npm run typecheck`.
 *
 * Import this file once from `app/_layout.tsx` (side-effectful).
 * Components consume translations via `useTranslation()` from
 * `react-i18next`; rename the destructured `t` to `translate` to match the
 * mobile-module convention (see
 * `.github/instructions/expenses-tracker-mobile.instructions.md`).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/**
 * Pick a starting language: stored choice → device locale → 'en' fallback.
 *
 * Uses `Intl.DateTimeFormat` rather than a dedicated `expo-localization`
 * dependency — the resolved locale is sufficient for our three-way switch
 * and avoids another native module.
 */
async function detectInitialLanguage(): Promise<LanguageCode> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
    return stored as LanguageCode;
  }
  const deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const base = deviceLocale.split('-')[0];
  const match = SUPPORTED_LANGUAGES.find((l) => l.code === base);
  return match ? match.code : 'en';
}

/**
 * Initialize i18next. Call exactly once at app start (from `_layout.tsx`).
 * Resolves with the active language; reject only on i18next misconfiguration.
 */
export async function initI18n(): Promise<LanguageCode> {
  const initial = await detectInitialLanguage();
  await i18n.use(initReactI18next).init({
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
    lng: initial,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false }, // React already escapes
  });
  return initial;
}

/**
 * Change the active language and persist the choice. UI components should
 * call this rather than `i18n.changeLanguage` directly so persistence stays
 * centralized.
 */
export async function setLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
}

export default i18n;
