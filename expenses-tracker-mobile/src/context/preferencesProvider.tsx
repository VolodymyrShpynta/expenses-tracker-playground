/**
 * Currency + date-range provider — analogue of the web frontend's
 * `useCurrencyProvider` / `useDateRangeProvider`, persisting the user's
 * preferences in `AsyncStorage` (the RN counterpart of `localStorage`).
 *
 * Mobile is offline-only and currently does **not** convert across
 * currencies — `mainCurrency` is the single reporting currency rendered
 * everywhere.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildRangeForPreset,
  VALID_PRESETS,
  type DateRange,
  type PresetKey,
} from '../utils/dateRange';

const CURRENCY_KEY = 'expenses-tracker-main-currency';
const PRESET_KEY = 'expenses-tracker-period-preset';
const THEME_KEY = 'expenses-tracker-theme-mode';
const FONT_SCALE_KEY = 'expenses-tracker-font-scale';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_PRESET: PresetKey = 'month';

export type ThemeMode = 'system' | 'light' | 'dark';
export type FontScaleKey = 'small' | 'medium' | 'large' | 'xlarge';

export const FONT_SCALES: Readonly<Record<FontScaleKey, number>> = {
  small: 0.875,
  medium: 1,
  large: 1.15,
  xlarge: 1.3,
};

const VALID_THEME_MODES: ReadonlyArray<ThemeMode> = ['system', 'light', 'dark'];
const VALID_FONT_SCALES: ReadonlyArray<FontScaleKey> = ['small', 'medium', 'large', 'xlarge'];

interface PreferencesContextValue {
  readonly mainCurrency: string;
  readonly setMainCurrency: (code: string) => void;
  readonly dateRange: DateRange;
  readonly preset: PresetKey;
  readonly setPreset: (key: PresetKey) => void;
  readonly setDateRange: (range: DateRange) => void;
  readonly themeMode: ThemeMode;
  readonly setThemeMode: (mode: ThemeMode) => void;
  readonly fontScale: FontScaleKey;
  readonly setFontScale: (s: FontScaleKey) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export interface PreferencesProviderProps {
  readonly children: ReactNode;
}

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  const [mainCurrency, setMainCurrencyState] = useState<string>(DEFAULT_CURRENCY);
  const [preset, setPresetState] = useState<PresetKey>(DEFAULT_PRESET);
  const [dateRange, setDateRangeState] = useState<DateRange>(() =>
    buildRangeForPreset(DEFAULT_PRESET),
  );
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [fontScale, setFontScaleState] = useState<FontScaleKey>('medium');

  // Hydrate from AsyncStorage. We don't gate render on this — defaults
  // are already valid; the UI just snaps to the user's prefs once loaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedCurrency, storedPreset, storedTheme, storedFont] = await Promise.all([
          AsyncStorage.getItem(CURRENCY_KEY),
          AsyncStorage.getItem(PRESET_KEY),
          AsyncStorage.getItem(THEME_KEY),
          AsyncStorage.getItem(FONT_SCALE_KEY),
        ]);
        if (cancelled) return;
        if (storedCurrency) setMainCurrencyState(storedCurrency);
        if (storedPreset && VALID_PRESETS.includes(storedPreset as PresetKey)) {
          const p = storedPreset as PresetKey;
          setPresetState(p);
          setDateRangeState(buildRangeForPreset(p));
        }
        if (storedTheme && VALID_THEME_MODES.includes(storedTheme as ThemeMode)) {
          setThemeModeState(storedTheme as ThemeMode);
        }
        if (storedFont && VALID_FONT_SCALES.includes(storedFont as FontScaleKey)) {
          setFontScaleState(storedFont as FontScaleKey);
        }
      } catch (e) {
        console.warn('Failed to hydrate preferences', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMainCurrency = useCallback(
    (code: string) => {
      setMainCurrencyState(code);
      void AsyncStorage.setItem(CURRENCY_KEY, code).catch((e) =>
        console.warn('Failed to save currency', e),
      );
    },
    [],
  );

  const setPreset = useCallback(
    (key: PresetKey) => {
      setPresetState(key);
      // Picker-driven presets ('range' / 'day') set the date range
      // themselves once the user confirms; rebuilding here would clobber
      // that pick. Window-style presets snap to a derived range.
      if (key !== 'range' && key !== 'day') {
        setDateRangeState(buildRangeForPreset(key));
      }
      void AsyncStorage.setItem(PRESET_KEY, key).catch((e) =>
        console.warn('Failed to save preset', e),
      );
    },
    [],
  );

  const setDateRange = useCallback((range: DateRange) => {
    setDateRangeState(range);
  }, []);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      void AsyncStorage.setItem(THEME_KEY, mode).catch((e) =>
        console.warn('Failed to save themeMode', e),
      );
    },
    [],
  );

  const setFontScale = useCallback(
    (s: FontScaleKey) => {
      setFontScaleState(s);
      void AsyncStorage.setItem(FONT_SCALE_KEY, s).catch((e) =>
        console.warn('Failed to save fontScale', e),
      );
    },
    [],
  );

  return (
    <PreferencesContext.Provider
      value={{
        mainCurrency,
        setMainCurrency,
        dateRange,
        preset,
        setPreset,
        setDateRange,
        themeMode,
        setThemeMode,
        fontScale,
        setFontScale,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used inside <PreferencesProvider>');
  }
  return ctx;
}

export function useMainCurrency(): { mainCurrency: string; setMainCurrency: (c: string) => void } {
  const { mainCurrency, setMainCurrency } = usePreferences();
  return { mainCurrency, setMainCurrency };
}

export function useDateRange(): {
  dateRange: DateRange;
  preset: PresetKey;
  setPreset: (key: PresetKey) => void;
  setDateRange: (range: DateRange) => void;
} {
  const { dateRange, preset, setPreset, setDateRange } = usePreferences();
  return { dateRange, preset, setPreset, setDateRange };
}

export function useThemeMode(): { themeMode: ThemeMode; setThemeMode: (m: ThemeMode) => void } {
  const { themeMode, setThemeMode } = usePreferences();
  return { themeMode, setThemeMode };
}

export function useFontScale(): { fontScale: FontScaleKey; setFontScale: (s: FontScaleKey) => void } {
  const { fontScale, setFontScale } = usePreferences();
  return { fontScale, setFontScale };
}
