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
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { layoutStyles } from '../theme/layout';
import { useAppColors } from '../theme/appColors';
import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';
import { radius } from '../theme/tokens';
import { interFont } from '../theme/typography';

export interface PeriodPickerDialogProps {
  readonly visible: boolean;
  readonly activePreset: PresetKey;
  readonly currentRange: DateRange;
  readonly onDismiss: () => void;
  readonly onSelect: (key: PresetKey) => void;
}

// Icon + label + subtitle + padding. A floor rather than a fixed height: the
// rows grow to fill a tall sheet, and below this the sheet scrolls.
const TILE_MIN_HEIGHT = 96;

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
  const appColors = useAppColors();
  const { fontScale } = useFontScale();
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
    const bg = active ? theme.colors.secondaryContainer : appColors.surfaceSunken;
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

  const rowMin = { minHeight: Math.round(TILE_MIN_HEIGHT * FONT_SCALES[fontScale]) };

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
            layoutStyles.contentColumn,
            {
              backgroundColor: theme.colors.background,
              borderColor: appColors.border,
              maxHeight: windowHeight * 0.9,
              minHeight: windowHeight * 0.8,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <Text variant="headlineSmall" style={styles.title}>
            {translate('dateRange.period')}
          </Text>

          {/* Fill the sheet when it's tall enough, scroll when it isn't (e.g.
              landscape) — the rows' `minHeight` is what makes the content
              outgrow the viewport instead of squashing under `overflow:
              hidden`. Mirrors the Add/Edit Expense sheet. */}
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.grid}>
              <View style={[styles.row, rowMin]}>{renderTile('range')}</View>
              <View style={[styles.row, rowMin]}>
                {renderTile('all')}
                {renderTile('day')}
              </View>
              <View style={[styles.row, rowMin]}>
                {renderTile('week')}
                {renderTile('today')}
              </View>
              <View style={[styles.row, rowMin]}>
                {renderTile('year')}
                {renderTile('month')}
              </View>
            </View>
          </ScrollView>
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
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontFamily: interFont.bold,
    marginBottom: 12,
  },
  // `flexGrow` with the default auto basis, not `flex: 1`: a zero basis would
  // report no natural height, so the scroll view would never learn the content
  // is taller than it is.
  scrollContent: {
    flexGrow: 1,
  },
  grid: {
    flexGrow: 1,
    gap: 8,
  },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    borderRadius: radius.md,
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
    fontFamily: interFont.semiBold,
    textAlign: 'center',
  },
  tileSubtitle: {
    textAlign: 'center',
  },
});
