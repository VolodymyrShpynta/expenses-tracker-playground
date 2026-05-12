/**
 * Page header with total spending + active period selector.
 *
 *   ◀  «range label»  ▶
 *
 * Tapping the centre label opens a `PeriodPickerDialog` (a grid of
 * preset tiles that mirrors the web frontend's `DateRangeSelector`).
 *
 * Chevrons shift the visible window by one preset unit (`shiftRange`)
 * for `today`/`week`/`month`/`year`. They're hidden for the presets
 * without a natural period (`all`, `range`, `day`).
 *
 * Preset selection in the dialog routes through two paths:
 *
 *   - Window presets (`today`/`week`/`month`/`year`/`all`) — call
 *     `setPreset` directly; the preferences provider derives the new
 *     range.
 *   - Picker presets (`range`, `day`) — close the grid and open the
 *     matching calendar dialog. On confirm we set the range first
 *     and the preset second, so the preset's "skip auto-rebuild"
 *     branch in `setPreset` doesn't clobber the picked range.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { IconButton, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { useDateRange } from '../context/preferencesProvider';
import {
  endOfDay,
  formatRange,
  shiftRange,
  startOfDay,
  type PresetKey,
} from '../utils/dateRange';
import { formatAmountWithCurrency } from '../utils/format';
import { PeriodPickerDialog } from './PeriodPickerDialog';
import { RangeDatePickerDialog, SingleDatePickerDialog } from './DatePickerDialogs';

export interface SpendingHeaderProps {
  readonly totalSpending: number;
  readonly currency: string;
}

const NON_SHIFTABLE: ReadonlyArray<PresetKey> = ['all', 'range', 'day'];

export function SpendingHeader({ totalSpending, currency }: SpendingHeaderProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const { dateRange, preset, setPreset, setDateRange } = useDateRange();
  const [periodOpen, setPeriodOpen] = useState(false);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  const rangeLabel = useMemo(
    () => formatRange(dateRange, i18n.language),
    [dateRange, i18n.language],
  );

  const canShift = !NON_SHIFTABLE.includes(preset);

  const handlePresetSelect = (key: PresetKey) => {
    setPeriodOpen(false);
    if (key === 'range') {
      setRangePickerOpen(true);
      return;
    }
    if (key === 'day') {
      setDayPickerOpen(true);
      return;
    }
    setPreset(key);
  };

  return (
    <>
      <View style={{ paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' }}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {translate('expenses.totalSpending')}
        </Text>
        <Text variant="headlineMedium" style={{ fontWeight: '700', marginTop: 4 }}>
          {formatAmountWithCurrency(totalSpending, currency, i18n.language)}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          {canShift ? (
            <IconButton
              icon="chevron-left"
              accessibilityLabel={translate('dateRange.prevPeriodAria')}
              onPress={() => setDateRange(shiftRange(dateRange, preset, 'prev'))}
            />
          ) : null}
          <TouchableRipple
            onPress={() => setPeriodOpen(true)}
            borderless
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
            }}
          >
            {/*
             * Matches the web `DateHeader` look (`SpendingDateHeader`): the
             * label itself is the affordance — no dropdown chevron, no pill
             * background. `formatRange` already uppercases the dates; we
             * only add weight + letter-spacing here.
             */}
            <Text
              variant="titleMedium"
              style={{
                fontWeight: '700',
                letterSpacing: 0.5,
                textAlign: 'center',
                color: theme.colors.onSurface,
              }}
            >
              {rangeLabel}
            </Text>
          </TouchableRipple>
          {canShift ? (
            <IconButton
              icon="chevron-right"
              accessibilityLabel={translate('dateRange.nextPeriodAria')}
              onPress={() => setDateRange(shiftRange(dateRange, preset, 'next'))}
            />
          ) : null}
        </View>
      </View>

      <PeriodPickerDialog
        visible={periodOpen}
        activePreset={preset}
        currentRange={dateRange}
        onDismiss={() => setPeriodOpen(false)}
        onSelect={handlePresetSelect}
      />

      <SingleDatePickerDialog
        visible={dayPickerOpen}
        value={dateRange.from}
        onDismiss={() => setDayPickerOpen(false)}
        onConfirm={(date) => {
          // Order matters: set the range *before* switching the preset so
          // `setPreset('day')` doesn't fall back to today's range.
          setDateRange({ from: startOfDay(date), to: endOfDay(date) });
          setPreset('day');
          setDayPickerOpen(false);
        }}
      />

      <RangeDatePickerDialog
        visible={rangePickerOpen}
        startDate={dateRange.from}
        endDate={dateRange.to}
        onDismiss={() => setRangePickerOpen(false)}
        onConfirm={({ startDate, endDate }) => {
          setDateRange({
            from: startOfDay(startDate),
            to: endOfDay(endDate),
          });
          setPreset('range');
          setRangePickerOpen(false);
        }}
      />
    </>
  );
}
