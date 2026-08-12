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
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon, Text, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { FONT_SCALES, useDateRange, useFontScale } from '../context/preferencesProvider';
import {
  endOfDay,
  formatRange,
  shiftRange,
  startOfDay,
  type PresetKey,
} from '../utils/dateRange';
import { formatTotalCompactWithCurrency } from '../utils/format';
import type { ConvertedAmount } from '../domain/exchangeRates';
import { useAppColors } from '../theme/appColors';
import { radius } from '../theme/tokens';
import { interFont } from '../theme/typography';
import { Eyebrow } from './GlowButton';
import { GradientText } from './GradientText';
import { PeriodPickerDialog } from './PeriodPickerDialog';
import { RangeDatePickerDialog, SingleDatePickerDialog } from './DatePickerDialogs';

/** Hero headline size before the user's font-scale preference is applied. */
const TOTAL_FONT_SIZE = 40;

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
  const appColors = useAppColors();
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];
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

  const ghostSurface = {
    backgroundColor: theme.colors.surface,
    borderColor: appColors.border,
    boxShadow: appColors.shadowSm,
  };

  return (
    <>
      <View style={styles.hero}>
        <Eyebrow>{translate('expenses.totalSpending')}</Eyebrow>

        <GradientText
          colors={appColors.headingGradient}
          containerStyle={styles.totalBox}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.4}
          style={{
            fontFamily: interFont.extraBold,
            fontSize: Math.round(TOTAL_FONT_SIZE * scale),
            lineHeight: Math.round(TOTAL_FONT_SIZE * 1.15 * scale),
            // The site's hero tracking, -0.035em.
            letterSpacing: -0.035 * TOTAL_FONT_SIZE * scale,
            textAlign: 'center',
          }}
        >
          {formatTotalCompactWithCurrency(total.amount, currency, i18n.language, total.approx)}
        </GradientText>

        <GestureDetector gesture={swipeGesture}>
          <View style={styles.periodRow}>
            {canShift ? (
              <Pressable
                onPress={() => setDateRange(shiftRange(dateRange, preset, 'prev'))}
                accessibilityRole="button"
                accessibilityLabel={translate('dateRange.prevPeriodAria')}
                style={({ pressed }) => [
                  styles.stepper,
                  ghostSurface,
                  pressed ? { borderColor: appColors.borderStrong } : null,
                ]}
              >
                <MaterialIcons name="chevron-left" size={24} color={theme.colors.onSurface} />
              </Pressable>
            ) : null}

            {/*
             * The active period is the site's `.btn-ghost`: elevated fill,
             * hairline border, pill radius. A leading calendar glyph and a
             * trailing chevron mark it as opening the period picker.
             * `flexShrink` + `adjustsFontSizeToFit` keep long localized
             * labels inside the pill instead of overflowing.
             */}
            <Pressable
              onPress={() => setPeriodOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={rangeLabel}
              style={({ pressed }) => [
                styles.periodPill,
                ghostSurface,
                pressed ? { borderColor: appColors.borderStrong } : null,
              ]}
            >
              <Icon source="calendar-range" size={18} color={theme.colors.primary} />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  flexShrink: 1,
                  fontFamily: interFont.semiBold,
                  fontSize: Math.round(15 * scale),
                  color: theme.colors.onSurface,
                }}
              >
                {rangeLabel}
              </Text>
              <Icon source="chevron-down" size={18} color={appColors.textDim} />
            </Pressable>

            {canShift ? (
              <Pressable
                onPress={() => setDateRange(shiftRange(dateRange, preset, 'next'))}
                accessibilityRole="button"
                accessibilityLabel={translate('dateRange.nextPeriodAria')}
                style={({ pressed }) => [
                  styles.stepper,
                  ghostSurface,
                  pressed ? { borderColor: appColors.borderStrong } : null,
                ]}
              >
                <MaterialIcons name="chevron-right" size={24} color={theme.colors.onSurface} />
              </Pressable>
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

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 16,
    gap: 10,
  },
  // Bounded width so `adjustsFontSizeToFit` has something to shrink against —
  // a mask otherwise collapses to its content and the total overflows.
  totalBox: { alignSelf: 'stretch' },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  periodPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  stepper: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
