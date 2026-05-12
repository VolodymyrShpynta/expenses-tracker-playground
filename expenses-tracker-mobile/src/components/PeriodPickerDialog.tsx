/**
 * `PeriodPickerDialog` — preset grid for the date-range selector.
 *
 * Mirrors the web frontend's `DateRangeSelector` mobile bottom-sheet
 * layout (`expenses-tracker-frontend/src/components/date-range/PresetGrid.tsx`):
 *
 *   ┌──────────── Period ────────────┐
 *   │  ┌──────── Select range ────┐  │  ← full-width
 *   │  │ • • •                   │  │
 *   │  └─────────────────────────┘  │
 *   │  ┌─────────┐  ┌───────────┐   │
 *   │  │All time │  │Select day │   │  ← 2-col grid
 *   │  └─────────┘  └───────────┘   │
 *   │  ┌─────────┐  ┌───────────┐   │
 *   │  │  Week   │  │  Today    │   │
 *   │  ┌─────────┐  ┌───────────┐   │
 *   │  │  Year   │  │  Month    │   │
 *   └────────────────────────────────┘
 *
 * Each tile shows its icon, label, and a localised subtitle (e.g.
 * "May 10 – May 16" for `week`, "Year 2026" for `year`). Tapping a
 * window-style tile (`week`/`today`/`year`/`month`/`all`) emits the
 * preset and closes the dialog; tapping `range` or `day` emits the
 * preset and leaves the dialog open for the calendar to take over —
 * the parent screen handles the calendar transition.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Dialog,
  Icon,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import {
  buildWeekRange,
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

interface PresetCard {
  readonly key: PresetKey;
  readonly icon: string; // Material Community Icons name
  readonly fullWidth?: boolean;
}

const CARDS: ReadonlyArray<PresetCard> = [
  { key: 'range', icon: 'dots-horizontal', fullWidth: true },
  { key: 'all', icon: 'infinity' },
  { key: 'day', icon: 'calendar-blank' },
  { key: 'week', icon: 'calendar-week' },
  { key: 'today', icon: 'calendar-today' },
  { key: 'year', icon: 'calendar-multiple' },
  { key: 'month', icon: 'calendar-month' },
];

export function PeriodPickerDialog({
  visible,
  activePreset,
  currentRange,
  onDismiss,
  onSelect,
}: PeriodPickerDialogProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();

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
      month: now.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }),
    };
  }, [currentRange, i18n.language, translate]);

  const renderTile = (card: PresetCard) => {
    const active = activePreset === card.key;
    const bg = active ? theme.colors.secondaryContainer : theme.colors.surfaceVariant;
    const fg = active ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant;
    const subtitle = subtitles[card.key];
    return (
      <View
        key={card.key}
        style={[
          styles.tileWrap,
          card.fullWidth ? styles.tileWrapFull : styles.tileWrapHalf,
        ]}
      >
        <TouchableRipple
          onPress={() => onSelect(card.key)}
          borderless
          style={[styles.tile, { backgroundColor: bg }]}
        >
          <View style={styles.tileInner}>
            <Icon source={card.icon} size={24} color={fg} />
            <Text variant="bodyMedium" style={[styles.tileLabel, { color: fg }]}>
              {translate(`dateRange.presets.${card.key}`)}
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
      </View>
    );
  };

  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      title={translate('dateRange.period')}
      showCloseButton={false}
    >
      <Dialog.Content>
        <View style={styles.grid}>{CARDS.map(renderTile)}</View>
      </Dialog.Content>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  tileWrap: {
    padding: 4,
  },
  tileWrapFull: {
    width: '100%',
  },
  tileWrapHalf: {
    width: '50%',
  },
  tile: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tileInner: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
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
