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
import { LogBox, ScrollView, StyleSheet, View } from 'react-native';
import {
  Dialog,
  Text,
  ThemeProvider,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import {
  Calendar,
  registerTranslation,
  cs,
  de,
  en,
  es,
  fr,
  hi,
  id,
  it,
  ja,
  ko,
  pl,
  pt,
  tr,
  ukUA,
  zh,
} from 'react-native-paper-dates';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import { ThemedButton } from './ThemedButton';
import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';
import { formatDate } from '../utils/dateRange';

// `react-native-paper-dates`' `Calendar` ALWAYS mounts its year picker — a
// `FlatList` — even while it's an invisible (opacity 0, pointer-events none)
// overlay you only see after tapping the month/year header. We deliberately
// host the `Calendar` inside a `ScrollView` (see the `Dialog.ScrollArea`
// below) so the date-picker's Cancel / Apply footer stays pinned and clear
// of the bottom tab bar on short screens. RN flags that FlatList-in-ScrollView
// as nested VirtualizedLists, but the year list is a tiny (~30-item) overlay,
// so the windowing/perf problems the warning guards against don't apply here.
// We can't restructure a third-party component, so silence just this one
// dev-only log. (No-op in production, where LogBox is inactive.) Remove this
// if the calendar ever stops living inside a ScrollView.
LogBox.ignoreLogs([
  'VirtualizedLists should never be nested inside plain ScrollViews',
]);

// The calendar's visible month name and weekday letters come from `Intl`
// (`Intl.DateTimeFormat(locale, ...)` inside the library's `Month` /
// `DayNames`), driven by the `locale` prop we pass to every `Calendar` below
// — so passing the active app language localizes them. Separately, the
// library looks up a *registered* translation for its non-visible UI strings
// (the prev/next arrows' accessibility labels); an unregistered locale there
// only logs a dev warning and falls back to English. We register the
// library's bundled translation for every language the app ships so those
// a11y labels are localized and the warning never fires. Done once at module
// scope. (`uk` uses the library's `ukUA` bundle; every other code maps 1:1.)
const CALENDAR_TRANSLATIONS = {
  en,
  uk: ukUA,
  cs,
  es,
  de,
  fr,
  pt,
  it,
  pl,
  hi,
  id,
  tr,
  ja,
  ko,
  zh,
};
for (const [code, translation] of Object.entries(CALENDAR_TRANSLATIONS)) {
  registerTranslation(code, translation);
}

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
      reserveBottomNav
    >
      <Dialog.ScrollArea style={styles.scrollArea}>
        <ScrollView>
          <View style={styles.calendarWrap}>
            <ThemeProvider theme={calendarTheme}>
              <Calendar
                locale={i18n.language}
                mode="single"
                date={pending}
                onChange={handleCalendarChange}
                startYear={START_YEAR}
                endYear={END_YEAR}
              />
            </ThemeProvider>
          </View>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions style={styles.actions}>
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
 * on the "from" step auto-advances to the "to" step and resets the "to"
 * date to today (clamped to >= the picked "from") so the calendar
 * scrolls to the current month — mirrors the web `RangePickerPanel`.
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
      // After picking "from", reset "to" to today so the calendar in
      // step 2 scrolls to the current month and pre-selects a sensible
      // default — mirrors the web `RangePickerPanel` behaviour. If the
      // user picked a "from" in the future, clamp "to" to that date so
      // the range stays inside `validRange` (which also disables earlier
      // days in the calendar).
      const today = new Date();
      setPendingTo(date > today ? date : today);
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
      reserveBottomNav
    >
      <Dialog.Content style={styles.chipContent}>
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
      </Dialog.Content>
      <Dialog.ScrollArea style={styles.scrollArea}>
        <ScrollView>
          <View style={styles.calendarWrap}>
            <ThemeProvider theme={calendarTheme}>
              <Calendar
                // `react-native-paper-dates` derives the swiper's initial
                // month from the `date` prop *only on mount* (see
                // `getInitialIndex` in the library's `Calendar.tsx`). Keying
                // by `step` remounts the calendar when the user advances
                // from "from" → "to" (or flips back via the chips) so it
                // scrolls to the newly bound date instead of getting stuck
                // on the previous step's month. Within a step, manual
                // month-swipes still stick.
                key={step}
                locale={i18n.language}
                mode="single"
                date={step === 'from' ? pendingFrom : pendingTo}
                onChange={handleCalendarChange}
                startYear={START_YEAR}
                endYear={END_YEAR}
                {...validRangeProp}
              />
            </ThemeProvider>
          </View>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions style={styles.actions}>
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
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];
  // Emphasize the active endpoint with a larger, bold label so it's clear
  // which date the calendar is editing; the inactive one stays at body size.
  // Override the body variant's size explicitly, scaled by the in-app font
  // picker like the app's other fixed-size chrome.
  const fontSize = Math.round((active ? 18 : 14) * scale);
  const lineHeight = Math.round((active ? 24 : 20) * scale);
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
        // Long localized dates (e.g. UK "21 трав. 2025 р.") can make the two
        // chips + dash wider than the dialog; keep each on one line and let it
        // shrink to fit rather than clipping the active chip at the edge.
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          color: active ? theme.colors.onSecondaryContainer : theme.colors.onSurface,
          fontWeight: active ? '700' : '400',
          fontSize,
          lineHeight,
        }}
      >
        {label}
      </Text>
    </TouchableRipple>
  );
}

function formatChipDate(d: Date, locale: string): string {
  return formatDate(d, locale, {
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

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 8,
  },
  chip: {
    // Allow the chip to shrink so two long dates + the dash fit the row
    // without overflowing (paired with the label's `adjustsFontSizeToFit`).
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipDash: {
    // Never shrink the dash — only the chips give up width.
    flexShrink: 0,
    paddingHorizontal: 2,
  },
  // Drop `Dialog.Content`'s default bottom padding under the chip row so
  // the calendar (now in its own scroll area below) sits close to it. Also
  // trim the default 24px side padding so the two date chips have more room
  // before they need to shrink.
  chipContent: {
    paddingBottom: 0,
    paddingHorizontal: 12,
  },
  // The calendar lives in a `Dialog.ScrollArea` so that on short screens
  // it can scroll while the title and Cancel / Apply footer stay pinned
  // (and clear of the tab bar). Strip the scroll area's default divider
  // borders, and trim its default 24px side padding right down: the
  // library draws each day as a fixed 46px circle across 7 `flex: 1`
  // columns, so on a ~360dp screen the generous padding shrank the
  // columns below 46px and adjacent circles overlapped. A small inset
  // keeps the columns >= 46px so the circles never touch.
  scrollArea: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
    paddingHorizontal: 4,
  },
  // The library's `Calendar` measures its parent (via its internal
  // `AutoSizer`) and silently clips trailing day rows when that parent is
  // too short — a 6-week month (e.g. March 2026) showed only days 1–28.
  // Inside a `ScrollView` a bare `minHeight` collapses (the `AutoSizer`'s
  // `flex: 1` root has nothing to fill), so pin a DEFINITE height that
  // fits the worst case: month/year header (~68) + weekday row (~44) +
  // 6 day rows (~52 each = 312) ≈ 424. When the viewport is shorter, the
  // scroll area scrolls; when taller, the calendar shows in full.
  calendarWrap: {
    height: 424,
  },
  // Let the Cancel / Apply pair wrap onto stacked rows instead of
  // clipping off-screen when a large system font (or a long localized
  // label) makes the two uppercase buttons wider than the dialog.
  actions: {
    flexWrap: 'wrap',
    rowGap: 4,
  },
});
