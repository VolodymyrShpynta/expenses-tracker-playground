import { createContext, useCallback, useContext, useState } from 'react';
import type { DateRange, PresetKey } from '../utils/dateRange.ts';
import { buildRangeForPreset, readStoredPreset, savePreset } from '../utils/dateRange.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface DateRangeContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  preset: PresetKey;
  setPreset: (key: PresetKey) => void;
}

export const DateRangeContext = createContext<DateRangeContextValue>({
  dateRange: buildRangeForPreset('year'),
  setDateRange: () => {},
  preset: 'year',
  setPreset: () => {},
});

export function useDateRangeProvider(): DateRangeContextValue {
  const { userId } = useAuth();
  const [preset, setPresetState] = useState<PresetKey>(() => readStoredPreset(userId));
  const [dateRange, setDateRange] = useState<DateRange>(() => buildRangeForPreset(readStoredPreset(userId)));

  const setPreset = useCallback((key: PresetKey) => {
    setPresetState(key);
    savePreset(key, userId);
  }, [userId]);

  return { dateRange, setDateRange, preset, setPreset };
}

export function useDateRange(): DateRangeContextValue {
  return useContext(DateRangeContext);
}
