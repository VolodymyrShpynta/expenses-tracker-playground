/**
 * `PeriodPickerDialog` — preset grid for the date-range selector.
 *
 * Mirrors the web frontend's `DateRangeSelector` mobile bottom-sheet
 * layout (`expenses-tracker-frontend/src/components/date-range/PresetGrid.tsx`):
 *
 *   ┌──────────── Period ───────────┐
 *   │  ┌──────── Select range ───┐  │  ← full-width
 *   │  │ • • •                   │  │
 *   │  └─────────────────────────┘  │
 *   │  ┌─────────┐  ┌───────────┐   │
 *   │  │All time │  │Select day │   │  ← 2-col grid
 *   │  └─────────┘  └───────────┘   │
 *   │  ┌─────────┐  ┌───────────┐   │
 *   │  │  Week   │  │  Today    │   │
 *   │  ┌─────────┐  ┌───────────┐   │
 *   │  │  Year   │  │  Month    │   │
 *   └───────────────────────────────┘
 *
 * Each tile shows its icon, label, and a localised subtitle (e.g.
 * "May 10 – May 16" for `week`, "Year 2026" for `year`). Tapping a
 * window-style tile (`week`/`today`/`year`/`month`/`all`) emits the
 * preset and closes the dialog; tapping `range` or `day` emits the
 * preset and leaves the dialog open for the calendar to take over —
 * the parent screen handles the calendar transition.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Icon,
  Portal,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  buildWeekRange,
  formatDate,
  formatShort,
  type DateRange,
  type PresetKey,
} from '../utils/dateRange';

export interface PeriodPickerDialogProps {
  readonly visible: boolean;
  readonly activePreset: PresetKey;
  readonly currentRange: DateRange;
  readonly onDismiss: () => void;
  readonly onSelect: (key: PresetKey) => void;
}

// Material Community Icons name per preset (Paper's `Icon` uses the MCI set).
const ICONS: Record<PresetKey, string> = {
  range: 'dots-horizontal',
  all: 'infinity',
  day: 'calendar-blank',
  week: 'calendar-week',
  today: 'calendar-today',
  year: 'calendar-multiple',
  month: 'calendar-month',
};

export function PeriodPickerDialog({
  visible,
  activePreset,
  currentRange,
  onDismiss,
  onSelect,
}: PeriodPickerDialogProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const subtitles = useMemo<Record<PresetKey, string>>(() => {
    const now = new Date();
    const week = buildWeekRange();
    return {
      range: `${formatShort(currentRange.from, i18n.language)} – ${formatShort(currentRange.to, i18n.language)}`,
      all: '',
      day: '',
      week: `${formatShort(week.from, i18n.language)} – ${formatShort(week.to, i18n.language)}`,
      today: now.toLocaleDateString(i18n.language, { month: 'long', day: 'numeric' }),
      year: translate('dateRange.year', { year: now.getFullYear() }),
      month: formatDate(now, i18n.language, { month: 'long', year: 'numeric' }),
    };
  }, [currentRange, i18n.language, translate]);

  const renderTile = (key: PresetKey) => {
    const active = activePreset === key;
    const bg = active ? theme.colors.secondaryContainer : theme.colors.surfaceVariant;
    const fg = active ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant;
    const subtitle = subtitles[key];
    return (
      <TouchableRipple
        key={key}
        onPress={() => onSelect(key)}
        borderless
        style={[styles.tile, { backgroundColor: bg }]}
      >
        <View style={styles.tileInner}>
          <Icon source={ICONS[key]} size={24} color={fg} />
          <Text variant="titleMedium" style={[styles.tileLabel, { color: fg }]}>
            {translate(`dateRange.presets.${key}`)}
          </Text>
          {subtitle ? (
            <Text
              variant="bodySmall"
              style={[styles.tileSubtitle, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </TouchableRipple>
    );
  };

  if (!visible) return null;

  return (
    // Bottom-sheet overlay teleported above the tab bar via <Portal>, mirroring
    // the Add/Edit Expense sheet: anchored to the screen bottom, stretched to a
    // 80% floor / 90% cap of the window height, with the preset tiles flex-
    // sized to fill it. Tapping the backdrop dismisses; the sheet swallows its
    // own taps.
    <Portal>
      <Pressable
        style={[styles.overlay, { backgroundColor: theme.colors.backdrop }]}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={translate('common.close')}
      >
        <Pressable
          onPress={() => {}}
          accessible={false}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              maxHeight: windowHeight * 0.9,
              minHeight: windowHeight * 0.8,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <Text variant="headlineSmall" style={styles.title}>
            {translate('dateRange.period')}
          </Text>

          <View style={styles.grid}>
            {renderTile('range')}
            <View style={styles.row}>
              {renderTile('all')}
              {renderTile('day')}
            </View>
            <View style={styles.row}>
              {renderTile('week')}
              {renderTile('today')}
            </View>
            <View style={styles.row}>
              {renderTile('year')}
              {renderTile('month')}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontWeight: '600',
    marginBottom: 12,
  },
  grid: {
    flex: 1,
    gap: 8,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tileInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 4,
  },
  tileLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  tileSubtitle: {
    textAlign: 'center',
  },
});
