/**
 * Date picker dialogs — built on `react-native-paper-dates` `Calendar`
 * inside our own `AppDialog` chrome.
 *
 * Two surfaces here:
 *
 *   - `SingleDatePickerDialog` — pick a single date (used by Add/Edit
 *     Expense, and by the "Select day" preset in the spending header).
 *   - `RangeDatePickerDialog` — pick a start/end pair in one popup, both
 *     date chips visible at once (mirrors the web's `RangePickerPanel`).
 *
 * Both dialogs share the same chrome (`AppDialog`), the same Cancel /
 * Apply footer (`ThemedButton`), and the library's standalone `Calendar`
 * (single mode → tappable year header) for date selection. We avoid the
 * library's full-screen `DatePickerModal` so the look/feel is identical
 * to the rest of the app's dialogs.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Dialog,
  Text,
  ThemeProvider,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { Calendar, registerTranslation, en } from 'react-native-paper-dates';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import { ThemedButton } from './ThemedButton';

// `react-native-paper-dates` refuses to render until at least one locale
// is registered. We only ship English here; `uk` / `cs` fall back to `en`
// via `mapLocale` (Calendar layout is locale-agnostic — only month and
// weekday labels are affected). Done at module scope so it's paid once.
registerTranslation('en', en);

/**
 * Year range exposed by the calendar's tappable year header. The library
 * defaults to 1800–2200, which makes the year picker an unusably long list.
 * For an expense tracker, dates outside a couple of decades around "now"
 * are practically meaningless, so we constrain the picker to a sensible
 * window and re-derive `END_YEAR` at module load (acceptable: month-long
 * staleness is fine for a date picker).
 */
const START_YEAR = 2000;
const END_YEAR = new Date().getFullYear() + 5;

export interface SingleDatePickerDialogProps {
  readonly visible: boolean;
  readonly value: Date;
  readonly onDismiss: () => void;
  readonly onConfirm: (date: Date) => void;
}

/**
 * Pick a single date.
 *
 *     ┌──────────── Pick a day ────────────┐
 *     │   < May 2026 ▾            < >      │   ← calendar with year picker
 *     │   S  M  T  W  T  F  S              │
 *     │   …  …  …  …  …  …  …              │
 *     │                                    │
 *     │              [Cancel] [Apply]      │
 *     └────────────────────────────────────┘
 *
 * Same chrome and footer as `RangeDatePickerDialog`, just without the
 * chip header — keeps the two pickers visually consistent.
 */
export function SingleDatePickerDialog({
  visible,
  value,
  onDismiss,
  onConfirm,
}: SingleDatePickerDialogProps) {
  const { t: translate, i18n } = useTranslation();
  const locale = useMemo(() => mapLocale(i18n.language), [i18n.language]);
  const calendarTheme = useCalendarTheme();

  const [pending, setPending] = useState<Date>(value);

  // Reset the pending date each time the parent opens the dialog. "Adjust
  // state during render" — React's recommended way to reset state in
  // response to a prop change (avoids the `react-hooks/set-state-in-effect`
  // lint rule and the extra render an effect would cost).
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setPending(value);
  }

  const handleCalendarChange = ({ date }: { date: Date | undefined }) => {
    if (date) setPending(date);
  };

  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      title={translate('dateRange.pickDay')}
      showCloseButton={false}
    >
      <Dialog.Content>
        <View style={styles.calendarWrap}>
          <ThemeProvider theme={calendarTheme}>
            <Calendar
              locale={locale}
              mode="single"
              date={pending}
              onChange={handleCalendarChange}
              startYear={START_YEAR}
              endYear={END_YEAR}
            />
          </ThemeProvider>
        </View>
      </Dialog.Content>
      <Dialog.Actions>
        <ThemedButton mode="text" onPress={onDismiss}>
          {translate('common.cancel')}
        </ThemedButton>
        <ThemedButton mode="contained" onPress={() => onConfirm(pending)}>
          {translate('common.apply')}
        </ThemedButton>
      </Dialog.Actions>
    </AppDialog>
  );
}

export interface RangeDatePickerDialogProps {
  readonly visible: boolean;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly onDismiss: () => void;
  readonly onConfirm: (range: { startDate: Date; endDate: Date }) => void;
}

/**
 * Range picker — single popup, both chips visible.
 *
 * Mirrors the web frontend's `RangePickerPanel`:
 *
 *     ┌──────── Select start date ─────────┐
 *     │   ⌜May 11, 2026⌟  –  May 12, 2026 │   ← chips: active one is filled
 *     │                                    │
 *     │   < May 2026 ▾            < >      │   ← calendar with year picker
 *     │   S  M  T  W  T  F  S              │
 *     │   …  …  …  …  …  …  …              │
 *     │                                    │
 *     │              [Cancel] [Apply]      │
 *     └────────────────────────────────────┘
 *
 * The active chip drives which date the calendar edits. Picking a date
 * on the "from" step auto-advances to the "to" step (matches the web).
 * If the user picks `to < from` we auto-swap on confirm so the parent
 * always receives `startDate <= endDate`.
 *
 * We use the library's standalone `Calendar` (single mode) rather than
 * `DatePickerModal` mode='range' because only single mode exposes a
 * tappable year header — the user previously asked for the web-style
 * year shortcut, and range mode is an infinite scroll of months.
 */
export function RangeDatePickerDialog({
  visible,
  startDate,
  endDate,
  onDismiss,
  onConfirm,
}: RangeDatePickerDialogProps) {
  const { t: translate, i18n } = useTranslation();
  const locale = useMemo(() => mapLocale(i18n.language), [i18n.language]);
  const calendarTheme = useCalendarTheme();

  const [step, setStep] = useState<'from' | 'to'>('from');
  const [pendingFrom, setPendingFrom] = useState<Date>(startDate);
  const [pendingTo, setPendingTo] = useState<Date>(endDate);

  // Reset the flow each time the parent opens the dialog. "Adjust state
  // during render" is the React-recommended pattern for resetting state
  // in response to a prop change without cascading effects.
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setPendingFrom(startDate);
      setPendingTo(endDate);
      setStep('from');
    }
  }

  const handleCalendarChange = ({ date }: { date: Date | undefined }) => {
    if (!date) return;
    if (step === 'from') {
      setPendingFrom(date);
      // If the new "from" is past the current "to", push "to" forward
      // so the range stays valid as the user moves to step 2.
      if (date > pendingTo) setPendingTo(date);
      setStep('to');
      return;
    }
    if (date < pendingFrom) {
      // Auto-swap when the user picks a "to" that's earlier than "from".
      setPendingTo(pendingFrom);
      setPendingFrom(date);
    } else {
      setPendingTo(date);
    }
  };

  const handleApply = () => {
    const [a, b] =
      pendingFrom <= pendingTo ? [pendingFrom, pendingTo] : [pendingTo, pendingFrom];
    onConfirm({ startDate: a, endDate: b });
  };

  // `exactOptionalPropertyTypes: true` forbids passing `undefined` to
  // an optional prop — conditionally spread `validRange` so the key is
  // absent on step 1 (free pick) and present on step 2 (disable dates
  // before "from").
  const validRangeProp =
    step === 'from' ? {} : { validRange: { startDate: pendingFrom } };

  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      title={
        step === 'from'
          ? translate('dateRange.selectStart')
          : translate('dateRange.selectEnd')
      }
      showCloseButton={false}
    >
      <Dialog.Content>
        <View style={styles.chipRow}>
          <RangeChip
            label={formatChipDate(pendingFrom, i18n.language)}
            active={step === 'from'}
            onPress={() => setStep('from')}
          />
          <Text variant="bodyMedium" style={styles.chipDash}>
            –
          </Text>
          <RangeChip
            label={formatChipDate(pendingTo, i18n.language)}
            active={step === 'to'}
            onPress={() => setStep('to')}
          />
        </View>
        <View style={styles.calendarWrap}>
          <ThemeProvider theme={calendarTheme}>
            <Calendar
              locale={locale}
              mode="single"
              date={step === 'from' ? pendingFrom : pendingTo}
              onChange={handleCalendarChange}
              startYear={START_YEAR}
              endYear={END_YEAR}
              {...validRangeProp}
            />
          </ThemeProvider>
        </View>
      </Dialog.Content>
      <Dialog.Actions>
        <ThemedButton mode="text" onPress={onDismiss}>
          {translate('common.cancel')}
        </ThemedButton>
        <ThemedButton mode="contained" onPress={handleApply}>
          {translate('common.apply')}
        </ThemedButton>
      </Dialog.Actions>
    </AppDialog>
  );
}

interface RangeChipProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}

/** Tappable date chip used by the range picker header. */
function RangeChip({ label, active, onPress }: RangeChipProps) {
  const theme = useTheme();
  return (
    <TouchableRipple
      onPress={onPress}
      borderless
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.colors.secondaryContainer : 'transparent',
        },
      ]}
    >
      <Text
        variant="bodyMedium"
        style={{
          color: active ? theme.colors.onSecondaryContainer : theme.colors.onSurface,
          fontWeight: active ? '700' : '400',
        }}
      >
        {label}
      </Text>
    </TouchableRipple>
  );
}

function formatChipDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Scoped theme override for the embedded `react-native-paper-dates`
 * `Calendar`. The library paints `theme.colors.surface` as solid
 * panels behind the weekday row (`DayNames.tsx`) and behind each
 * prev/next month `IconButton` (`CalendarHeader.tsx`).
 *
 * In **dark** mode our `surface` (`navy[400]`) is visibly lighter than
 * the dialog `background` (`navy[500]`), so those panels read as a
 * pleasant raised area — no override needed.
 *
 * In **light** mode our `surface` is pure white (`#ffffff`) sitting on
 * an off-white `background` (`blueAccent[50]` = `#f9f8ff`). The
 * contrast is so faint that the panels are barely visible and the
 * weekday letters / chevron icons look like they're floating. We
 * compensate by:
 *
 *   - Pushing `surface` to `secondaryContainer` (the same soft mint
 *     tone the calculator uses for its operator keys, e.g. the `-`
 *     button). That gives the weekday row and chevron buttons a
 *     consistent brand-tinted plate against the off-white background.
 *   - Forcing `onSurface` / `onSurfaceVariant` to pure black. The
 *     library's `DayName.tsx` hard-codes `opacity: 0.7` on the weekday
 *     letters (no theme override can defeat that), so we need to start
 *     from pure black to land on a readable mid-gray.
 */
function useCalendarTheme(): MD3Theme {
  const theme = useTheme();
  return useMemo(() => {
    if (theme.dark) return theme;
    return {
      ...theme,
      colors: {
        ...theme.colors,
        // Soft blue plate (matches the brand's primary container) so
        // the weekday row and chevron buttons separate clearly from
        // the off-white dialog background.
        surface: theme.colors.primaryContainer,
        // Pure black so DayName.tsx's hard-coded 0.7 opacity still
        // renders a readable mid-gray, and IconButton's chevrons (which
        // default to onSurfaceVariant) are fully visible.
        onSurface: '#000000',
        onSurfaceVariant: '#000000',
      },
    };
  }, [theme]);
}

/** Map our app languages to locales `react-native-paper-dates` knows about. */
function mapLocale(lang: string): string {
  // The library ships only `en` by default; uk/cs fall back to en until
  // the matching translations are registered. Calendar layout is still
  // correct (just the month/weekday labels are English).
  if (lang.startsWith('uk') || lang.startsWith('cs')) return 'en';
  return 'en';
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipDash: {
    paddingHorizontal: 4,
  },
  // The library's `Calendar` lays itself out lazily based on parent
  // size and silently clips trailing day rows when the parent is too
  // short — that's why a month with 6 week rows (e.g. March 2026) was
  // showing only days 1–28. Give it a minHeight that fits the worst
  // case: month/year header (~56) + weekday row (~40) + 6 day rows
  // (~50 each) = ~396, rounded up for a small safety margin.
  calendarWrap: {
    minHeight: 420,
  },
});
