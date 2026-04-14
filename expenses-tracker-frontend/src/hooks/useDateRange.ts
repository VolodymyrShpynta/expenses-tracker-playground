import { createContext, useCallback, useContext, useState } from 'react';
import type { DateRange, PresetKey } from '../utils/dateRange.ts';
import { buildRangeForPreset, readStoredPreset, savePreset } from '../utils/dateRange.ts';

interface DateRangeContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  preset: PresetKey;
  setPreset: (key: PresetKey) => void;
}

const initial = readStoredPreset();

export const DateRangeContext = createContext<DateRangeContextValue>({
  dateRange: buildRangeForPreset(initial),
  setDateRange: () => {},
  preset: initial,
  setPreset: () => {},
});

export function useDateRangeProvider(): DateRangeContextValue {
  const [preset, setPresetState] = useState<PresetKey>(readStoredPreset);
  const [dateRange, setDateRange] = useState<DateRange>(() => buildRangeForPreset(readStoredPreset()));

  const setPreset = useCallback((key: PresetKey) => {
    setPresetState(key);
    savePreset(key);
  }, []);

  return { dateRange, setDateRange, preset, setPreset };
}

export function useDateRange(): DateRangeContextValue {
  return useContext(DateRangeContext);
}
