/**
 * TypeScript module augmentation that makes `t()` / `useTranslation()` keys
 * compile-time checked against the English locale resource.
 *
 * Effects:
 *  - `translate('categoryDailog.title')` (typo) is a TS error.
 *  - Editor autocomplete shows every available key.
 *  - Renaming a key in `en.json` produces TS errors at every call site.
 *
 * English is treated as the canonical schema; translation files for other
 * languages are not type-checked here (they are validated at runtime by
 * i18next's missing-key handler — keep `en.json` as the source of truth and
 * mirror new keys into `uk.json` / `cs.json`).
 */
import 'i18next';
import type en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
