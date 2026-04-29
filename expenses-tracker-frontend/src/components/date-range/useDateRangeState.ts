import { useCallback, useState } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import {
  buildAllTimeRange,
  buildMonthRange,
  buildTodayRange,
  buildWeekRange,
  buildYearRange,
  endOfDay,
  readStoredPreset,
  savePreset,
  startOfDay,
  type DateRange,
  type PresetKey,
} from '../../utils/dateRange.ts';
import type { RangeStep } from './RangePickerPanel.tsx';

export type PickerMode = 'none' | 'day' | 'range';

interface UseDateRangeStateOptions {
  value: DateRange;
  onChange: (range: DateRange) => void;
  onPresetChange?: (preset: PresetKey) => void;
}

/**
 * Owns the local UI state for the date-range selector — everything except
 * the rendering. Splits "presets" (synchronous range emission) from
 * "pickers" (deferred — user must confirm a calendar selection first).
 */
export function useDateRangeState({
  value,
  onChange,
  onPresetChange,
}: UseDateRangeStateOptions) {
  const [activePreset, setActivePresetState] = useState<PresetKey>(readStoredPreset);

  const setActivePreset = useCallback(
    (key: PresetKey) => {
      setActivePresetState(key);
      savePreset(key);
      onPresetChange?.(key);
    },
    [onPresetChange],
  );

  const [pickerMode, setPickerMode] = useState<PickerMode>('none');
  const [pickerAnchorEl, setPickerAnchorEl] = useState<HTMLElement | null>(null);
  const [rangeStep, setRangeStep] = useState<RangeStep>('from');
  const [pendingFrom, setPendingFrom] = useState<Dayjs | null>(null);
  const [pendingTo, setPendingTo] = useState<Dayjs | null>(null);
  const [pendingDay, setPendingDay] = useState<Dayjs | null>(null);

  const closePicker = useCallback(() => {
    setPickerMode('none');
    setPickerAnchorEl(null);
  }, []);

  const openDayPicker = useCallback(
    (anchor: HTMLElement | null) => {
      setPickerAnchorEl(anchor);
      setPendingDay(dayjs(value.from));
      // Tiny delay so the parent popover finishes closing first; otherwise
      // the calendar opens behind the fading backdrop on slow devices.
      setTimeout(() => setPickerMode('day'), 200);
    },
    [value.from],
  );

  const openRangePicker = useCallback(
    (anchor: HTMLElement | null) => {
      setPickerAnchorEl(anchor);
      setPendingFrom(dayjs(value.from));
      setPendingTo(dayjs(value.to));
      setRangeStep('from');
      setTimeout(() => setPickerMode('range'), 200);
    },
    [value.from, value.to],
  );

  const handleDayPick = useCallback((d: Dayjs | null) => {
    if (d) setPendingDay(d);
  }, []);

  const handleDayConfirm = useCallback(() => {
    if (pendingDay) {
      const date = pendingDay.toDate();
      onChange({ from: startOfDay(date), to: endOfDay(date) });
    }
    closePicker();
  }, [pendingDay, onChange, closePicker]);

  const handleRangeCalendarChange = useCallback(
    (d: Dayjs | null) => {
      if (!d) return;
      if (rangeStep === 'from') {
        setPendingFrom(d);
        // If new "from" is after current "to", reset "to" to same day
        if (pendingTo && d.isAfter(pendingTo)) setPendingTo(d);
        setRangeStep('to');
      } else {
        // If picked "to" is before "from", swap them
        if (pendingFrom && d.isBefore(pendingFrom)) {
          setPendingTo(pendingFrom);
          setPendingFrom(d);
        } else {
          setPendingTo(d);
        }
      }
    },
    [rangeStep, pendingFrom, pendingTo],
  );

  const handleRangeConfirm = useCallback(() => {
    if (pendingFrom && pendingTo) {
      onChange({
        from: startOfDay(pendingFrom.toDate()),
        to: endOfDay(pendingTo.toDate()),
      });
    }
    closePicker();
  }, [pendingFrom, pendingTo, onChange, closePicker]);

  /** Apply a preset directly, or open the picker if it needs user input. */
  const selectPreset = useCallback(
    (key: PresetKey, anchor: HTMLElement | null) => {
      setActivePreset(key);
      switch (key) {
        case 'week':
          onChange(buildWeekRange());
          break;
        case 'month':
          onChange(buildMonthRange());
          break;
        case 'year':
          onChange(buildYearRange());
          break;
        case 'today':
          onChange(buildTodayRange());
          break;
        case 'all':
          onChange(buildAllTimeRange());
          break;
        case 'day':
          openDayPicker(anchor);
          break;
        case 'range':
          openRangePicker(anchor);
          break;
      }
    },
    [setActivePreset, onChange, openDayPicker, openRangePicker],
  );

  /**
   * Shift the current range by one period in `direction` (-1 / +1).
   * No-op for presets without a natural period (range, all, day).
   */
  const shift = useCallback(
    (direction: -1 | 1) => {
      if (activePreset === 'range' || activePreset === 'all' || activePreset === 'day') {
        return;
      }
      const from = new Date(value.from);
      const to = new Date(value.to);
      const { unit, count } = shiftAmountFor(activePreset);
      const delta = direction * count;
      if (unit === 'day') {
        from.setDate(from.getDate() + delta);
        to.setDate(to.getDate() + delta);
      } else if (unit === 'month') {
        from.setMonth(from.getMonth() + delta);
        from.setDate(1);
        to.setFullYear(from.getFullYear(), from.getMonth() + 1, 0);
        to.setHours(23, 59, 59, 999);
      } else {
        from.setFullYear(from.getFullYear() + delta);
        to.setFullYear(to.getFullYear() + delta);
      }
      onChange({ from, to });
    },
    [activePreset, value, onChange],
  );

  const canShift =
    activePreset !== 'range' && activePreset !== 'all' && activePreset !== 'day';

  return {
    activePreset,
    canShift,
    shift,
    selectPreset,
    pickerMode,
    pickerAnchorEl,
    closePicker,
    rangeStep,
    setRangeStep,
    pendingDay,
    pendingFrom,
    pendingTo,
    handleDayPick,
    handleDayConfirm,
    handleRangeCalendarChange,
    handleRangeConfirm,
  };
}

function shiftAmountFor(preset: PresetKey): { unit: 'day' | 'month' | 'year'; count: number } {
  switch (preset) {
    case 'today': return { unit: 'day', count: 1 };
    case 'week': return { unit: 'day', count: 7 };
    case 'month': return { unit: 'month', count: 1 };
    case 'year': return { unit: 'year', count: 1 };
    default: return { unit: 'month', count: 1 };
  }
}
