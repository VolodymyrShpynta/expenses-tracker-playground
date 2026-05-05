/**
 * Page header with total spending + active period selector.
 *
 * Three regions:
 *   ◀  «range label / preset»  ▶
 *
 * The chevrons shift the visible window by one preset unit (`shiftRange`)
 * for `today`/`week`/`month`/`year`. They're hidden for `all`. Tapping
 * the centre chip opens a preset menu *and* offers a "custom range" item
 * that brings up `<RangeDatePickerDialog>`.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { IconButton, Menu, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useDateRange } from '../context/preferencesProvider';
import { formatRange, shiftRange, type PresetKey } from '../utils/dateRange';
import { formatAmountWithCurrency } from '../utils/format';
import { RangeDatePickerDialog } from './DatePickerDialogs';

const PRESETS: ReadonlyArray<PresetKey> = ['today', 'week', 'month', 'year', 'all'];

export interface SpendingHeaderProps {
  readonly totalSpending: number;
  readonly currency: string;
}

export function SpendingHeader({ totalSpending, currency }: SpendingHeaderProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const { dateRange, preset, setPreset, setDateRange } = useDateRange();
  const [menuOpen, setMenuOpen] = useState(false);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  const rangeLabel = useMemo(
    () => formatRange(dateRange, i18n.language),
    [dateRange, i18n.language],
  );

  const canShift = preset !== 'all';

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
          <IconButton
            icon="chevron-left"
            disabled={!canShift}
            onPress={() => setDateRange(shiftRange(dateRange, preset, 'prev'))}
          />
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchor={
              <TouchableRipple
                onPress={() => setMenuOpen(true)}
                borderless
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                }}
              >
                <>
                  <Text variant="labelLarge">{rangeLabel}</Text>
                  <MaterialIcons
                    name="arrow-drop-down"
                    size={20}
                    color={theme.colors.onSurfaceVariant}
                  />
                </>
              </TouchableRipple>
            }
          >
            {PRESETS.map((p) => (
              <Menu.Item
                key={p}
                title={translate(`dateRange.presets.${p}`)}
                onPress={() => {
                  setPreset(p);
                  setMenuOpen(false);
                }}
                {...(preset === p ? { leadingIcon: 'check' } : {})}
              />
            ))}
            <Menu.Item
              title={translate('dateRange.custom')}
              onPress={() => {
                setMenuOpen(false);
                setRangePickerOpen(true);
              }}
              leadingIcon="calendar-range"
            />
          </Menu>
          <IconButton
            icon="chevron-right"
            disabled={!canShift}
            onPress={() => setDateRange(shiftRange(dateRange, preset, 'next'))}
          />
        </View>
      </View>

      <RangeDatePickerDialog
        visible={rangePickerOpen}
        startDate={dateRange.from}
        endDate={dateRange.to}
        onDismiss={() => setRangePickerOpen(false)}
        onConfirm={({ startDate, endDate }) => {
          setDateRange({
            from: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0),
            to: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999),
          });
          setRangePickerOpen(false);
        }}
      />
    </>
  );
}
