/**
 * Localized wrapper around MUI X's `LocalizationProvider`.
 *
 * Reads the active language from `react-i18next` and re-mounts the picker
 * adapter with the matching `adapterLocale` (so weekday headers, month names,
 * and first-day-of-week follow the user's choice) plus the matching
 * `localeText` bundle (for picker UI strings such as `previousMonth` aria
 * labels).
 *
 * Dayjs locale itself is kept in sync globally by `src/i18n/index.ts`, so
 * `dayjs().format(...)` calls in the rest of the app also stay localized.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { enUS, ukUA, csCZ } from '@mui/x-date-pickers/locales';
import { resolveLanguage } from './locale.ts';

const PICKER_LOCALE_TEXT = {
  en: enUS.components.MuiLocalizationProvider.defaultProps.localeText,
  uk: ukUA.components.MuiLocalizationProvider.defaultProps.localeText,
  cs: csCZ.components.MuiLocalizationProvider.defaultProps.localeText,
} as const;

type SupportedLocale = keyof typeof PICKER_LOCALE_TEXT;

interface LocalizedDateProviderProps {
  children: ReactNode;
}

export function LocalizedDateProvider({ children }: LocalizedDateProviderProps) {
  const { i18n } = useTranslation();
  const language = resolveLanguage(i18n);
  const locale: SupportedLocale = language in PICKER_LOCALE_TEXT
    ? (language as SupportedLocale)
    : 'en';

  return (
    <LocalizationProvider
      // `key` forces a fresh adapter when the language changes so cached
      // formatters inside the date pickers pick up the new locale.
      key={locale}
      dateAdapter={AdapterDayjs}
      adapterLocale={locale}
      localeText={PICKER_LOCALE_TEXT[locale]}
    >
      {children}
    </LocalizationProvider>
  );
}
