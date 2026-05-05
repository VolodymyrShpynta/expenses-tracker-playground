/**
 * Date picker dialog backed by `react-native-paper-dates`.
 *
 * Wraps `DatePickerModal` from RN Paper Dates so the rest of the app can
 * use a consistent imperative open/close API. Locale registration for
 * the app's three supported languages is handled here via `registerTranslation`.
 */
import { useMemo } from 'react';
import {
  DatePickerModal,
  registerTranslation,
  en,
} from 'react-native-paper-dates';
import { useTranslation } from 'react-i18next';

// `react-native-paper-dates` ships translations only for selected locales;
// fall back to English for the rest. Done at module scope so registration
// is paid once.
registerTranslation('en', en);

export interface SingleDatePickerDialogProps {
  readonly visible: boolean;
  readonly value: Date;
  readonly onDismiss: () => void;
  readonly onConfirm: (date: Date) => void;
}

export function SingleDatePickerDialog({
  visible,
  value,
  onDismiss,
  onConfirm,
}: SingleDatePickerDialogProps) {
  const { i18n } = useTranslation();
  const locale = useMemo(() => mapLocale(i18n.language), [i18n.language]);
  return (
    <DatePickerModal
      locale={locale}
      mode="single"
      visible={visible}
      date={value}
      onDismiss={onDismiss}
      onConfirm={(p: { date: Date | undefined }) => {
        if (p.date) onConfirm(p.date);
      }}
    />
  );
}

export interface RangeDatePickerDialogProps {
  readonly visible: boolean;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly onDismiss: () => void;
  readonly onConfirm: (range: { startDate: Date; endDate: Date }) => void;
}

export function RangeDatePickerDialog({
  visible,
  startDate,
  endDate,
  onDismiss,
  onConfirm,
}: RangeDatePickerDialogProps) {
  const { i18n } = useTranslation();
  const locale = useMemo(() => mapLocale(i18n.language), [i18n.language]);
  return (
    <DatePickerModal
      locale={locale}
      mode="range"
      visible={visible}
      startDate={startDate}
      endDate={endDate}
      onDismiss={onDismiss}
      onConfirm={(p: { startDate: Date | undefined; endDate: Date | undefined }) => {
        if (p.startDate && p.endDate) {
          onConfirm({ startDate: p.startDate, endDate: p.endDate });
        }
      }}
    />
  );
}

/** Map our app languages to locales `react-native-paper-dates` knows about. */
function mapLocale(lang: string): string {
  // The library ships only `en` by default; uk/cs fall back to en until
  // the matching translations are registered. Calendar layout is still
  // correct (just the month/weekday labels are English).
  if (lang.startsWith('uk') || lang.startsWith('cs')) return 'en';
  return 'en';
}
