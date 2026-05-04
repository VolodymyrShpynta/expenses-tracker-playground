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
 * Locale JSON files are copied from the web frontend at scaffold time
 * (see `scripts/copy-locales.mjs`). Both modules render the same keys, so
 * the contract is identical — adding a new key on web means adding it on
 * mobile in the same commit.
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

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština' },
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
