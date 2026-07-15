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
 * The whole period row also accepts a horizontal swipe gesture as an
 * equivalent affordance: swipe right → previous period, swipe left →
 * next period. The swipe is gated by the same `canShift` check so the
 * non-shiftable presets behave identically to their chevron-less row.
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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon, IconButton, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useDateRange } from '../context/preferencesProvider';
import {
  endOfDay,
  formatRange,
  shiftRange,
  startOfDay,
  type PresetKey,
} from '../utils/dateRange';
import { formatTotalCompactWithCurrency } from '../utils/format';
import type { ConvertedAmount } from '../domain/exchangeRates';
import { PeriodPickerDialog } from './PeriodPickerDialog';
import { RangeDatePickerDialog, SingleDatePickerDialog } from './DatePickerDialogs';

export interface SpendingHeaderProps {
  /**
   * Total to display, paired with the `approx` propagation flag so the
   * `~` prefix is applied automatically when at least one contributing
   * expense was converted using the live fallback rate. See
   * `src/domain/exchangeRates.ts` for the conversion contract.
   */
  readonly total: ConvertedAmount;
  readonly currency: string;
}

const NON_SHIFTABLE: ReadonlyArray<PresetKey> = ['all', 'range', 'day'];

export function SpendingHeader({ total, currency }: SpendingHeaderProps) {
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

  // Horizontal swipe = chevron equivalent. Mirrors photo-gallery convention:
  // dragging content to the right reveals the *previous* period (older), and
  // dragging to the left reveals the *next* period. The thresholds keep it
  // from firing on vertical scrolls or accidental taps: the gesture must be
  // dominantly horizontal (|dx| > 2*|dy|) and either travel ≥ 40 px or end
  // with a flick velocity ≥ 400 px/s. `failOffsetY` lets the parent scroll
  // view take over the moment a finger drifts vertically.
  const shiftBy = (direction: 'prev' | 'next') => {
    setDateRange(shiftRange(dateRange, preset, direction));
  };
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canShift)
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onEnd((event) => {
          'worklet';
          const dx = event.translationX;
          const dy = event.translationY;
          const vx = event.velocityX;
          const horizontalEnough = Math.abs(dx) > Math.abs(dy) * 2;
          const passedThreshold = Math.abs(dx) >= 40 || Math.abs(vx) >= 400;
          if (!horizontalEnough || !passedThreshold) return;
          scheduleOnRN(shiftBy, dx > 0 ? 'prev' : 'next');
        }),
    // `shiftBy` closes over `dateRange`/`preset`/`setDateRange`; recreate the
    // gesture when any of those change so `onEnd` always reads fresh values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canShift, dateRange, preset],
  );

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
        <Text
          variant="headlineMedium"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontWeight: '700', marginTop: 4 }}
        >
          {formatTotalCompactWithCurrency(total.amount, currency, i18n.language, total.approx)}
        </Text>

        <GestureDetector gesture={swipeGesture}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              marginTop: 8,
              alignSelf: 'stretch',
            }}
          >
            {canShift ? (
              <IconButton
                icon={({ size, color }) => (
                  <MaterialIcons name="arrow-back-ios" size={size} color={color} />
                )}
                iconColor={theme.colors.primary}
                size={28}
                accessibilityLabel={translate('dateRange.prevPeriodAria')}
                onPress={() => setDateRange(shiftRange(dateRange, preset, 'prev'))}
                style={{ margin: 0 }}
              />
            ) : null}
            {/*
             * The active period reads as a filled, "expandable" pill button:
             * a leading calendar glyph, the range label, and a trailing
             * dropdown chevron that signals tapping opens the period picker.
             * Uses the theme's primary-container tokens so it stays on-brand
             * in light/dark. `flexShrink` + `adjustsFontSizeToFit` keep long
             * localized labels inside the pill instead of overflowing.
             */}
            <TouchableRipple
              onPress={() => setPeriodOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={rangeLabel}
              style={{
                flexShrink: 1,
                borderRadius: 999,
                overflow: 'hidden',
                backgroundColor: theme.colors.primaryContainer,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                }}
              >
                <Icon source="calendar-range" size={20} color={theme.colors.onPrimaryContainer} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    flexShrink: 1,
                    fontSize: 16,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                    color: theme.colors.onPrimaryContainer,
                  }}
                >
                  {rangeLabel}
                </Text>
                <Icon source="chevron-down" size={20} color={theme.colors.onPrimaryContainer} />
              </View>
            </TouchableRipple>
            {canShift ? (
              <IconButton
                icon={({ size, color }) => (
                  <MaterialIcons name="arrow-forward-ios" size={size} color={color} />
                )}
                iconColor={theme.colors.primary}
                size={28}
                accessibilityLabel={translate('dateRange.nextPeriodAria')}
                onPress={() => setDateRange(shiftRange(dateRange, preset, 'next'))}
                style={{ margin: 0 }}
              />
            ) : null}
          </View>
        </GestureDetector>
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
