import { createContext, useState, useMemo } from 'react';
import { createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import type { Theme } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// Color scales
// ---------------------------------------------------------------------------

const grey = {
  100: '#e0e0e0',
  200: '#c2c2c2',
  300: '#a3a3a3',
  400: '#858585',
  500: '#666666',
  600: '#525252',
  700: '#3d3d3d',
  800: '#292929',
  900: '#141414',
} as const;

const navy = {
  100: '#d0d1d5',
  200: '#a1a4ab',
  300: '#727681',
  400: '#1F2A40',
  500: '#141b2d',
  600: '#101624',
  700: '#0c101b',
  800: '#080b12',
  900: '#040509',
} as const;

const greenAccent = {
  100: '#dbf5ee',
  200: '#b7ebde',
  300: '#94e2cd',
  400: '#70d8bd',
  500: '#4cceac',
  600: '#3da58a',
  700: '#2e7c67',
  800: '#1e5245',
  900: '#0f2922',
} as const;

const redAccent = {
  100: '#f8dcdb',
  200: '#f1b9b7',
  300: '#e99592',
  400: '#e2726e',
  500: '#db4f4a',
  600: '#af3f3b',
  700: '#832f2c',
  800: '#58201e',
  900: '#2c100f',
} as const;

const blueAccent = {
  50: '#f9f8ff',
  100: '#e1e2fe',
  200: '#c3c6fd',
  300: '#a4a9fc',
  400: '#868dfb',
  500: '#6870fa',
  600: '#535ac8',
  700: '#3e4396',
  800: '#2a2d64',
  900: '#151632',
} as const;

export const colors = { grey, navy, greenAccent, redAccent, blueAccent } as const;

// ---------------------------------------------------------------------------
// Theme builder
// ---------------------------------------------------------------------------

interface ColorModeToggle {
  toggleColorMode: () => void;
}

export type FontScale = 'small' | 'medium' | 'large' | 'xlarge';

interface FontScaleControl {
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
}

// Multipliers applied to base typography sizes. 'medium' preserves existing UI.
const FONT_SCALE_FACTOR: Record<FontScale, number> = {
  small: 0.875,
  medium: 1,
  large: 1.125,
  xlarge: 1.25,
};

export const FONT_SCALE_LABEL: Record<FontScale, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xlarge: 'Extra Large',
};

export const themeSettings = (mode: PaletteMode, fontScale: FontScale = 'medium') => {
  const isDark = mode === 'dark';
  const f = FONT_SCALE_FACTOR[fontScale];

  const paperBg = isDark ? navy[400] : blueAccent[50];
  const scrollbarTrack = isDark ? navy[500] : grey[100];
  const scrollbarThumbStart = isDark ? navy[400] : grey[300];
  const scrollbarThumbEnd = isDark ? blueAccent[600] : grey[600];
  const scrollbarThumbHoverStart = isDark ? blueAccent[400] : blueAccent[500];
  const scrollbarThumbHoverEnd = isDark ? blueAccent[500] : blueAccent[600];

  return {
    palette: {
      mode,
      primary: {
        main: isDark ? blueAccent[500] : blueAccent[700],
      },
      secondary: {
        light: isDark ? greenAccent[400] : greenAccent[600],
        main: greenAccent[500],
        dark: isDark ? greenAccent[600] : greenAccent[400],
      },
      error: {
        main: redAccent[500],
      },
      text: {
        primary: isDark ? grey[100] : grey[900],
        secondary: isDark ? grey[300] : grey[700],
      },
      background: {
        ...(isDark && { default: navy[500] }),
        paper: paperBg,
      },
    },
    typography: {
      fontFamily: 'Roboto, sans-serif',
      fontSize: 15 * f,
      h1: { fontSize: 48 * f, fontWeight: 700 },
      h2: { fontSize: 38 * f, fontWeight: 700 },
      h3: { fontSize: 28 * f, fontWeight: 600 },
      h4: { fontSize: 24 * f, fontWeight: 600 },
      h5: { fontSize: 20 * f, fontWeight: 500 },
      h6: { fontSize: 17 * f, fontWeight: 500 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { scrollbarGutter: 'stable' },
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor: `${scrollbarThumbStart} ${scrollbarTrack}`,
          },
          '*::-webkit-scrollbar': { width: '8px', height: '8px' },
          '*::-webkit-scrollbar-track': { backgroundColor: scrollbarTrack },
          '*::-webkit-scrollbar-thumb': {
            background: `linear-gradient(180deg, ${scrollbarThumbStart} 0%, ${scrollbarThumbEnd} 100%)`,
            border: `2px solid ${scrollbarTrack}`,
            borderRadius: '999px',
          },
          '*::-webkit-scrollbar-thumb:hover': {
            background: `linear-gradient(180deg, ${scrollbarThumbHoverStart} 0%, ${scrollbarThumbHoverEnd} 100%)`,
          },
          '*::-webkit-scrollbar-corner': { backgroundColor: scrollbarTrack },
        },
      },
      // Enlarge MUI X DateCalendar globally. Default ~320×334 with 36px day cells;
      // we scale the whole grid so every DateCalendar (AddExpenseDialog, DateRangeSelector, ...)
      // feels comfortable on touch and desktop. The calendar stretches to its container;
      // callers cap the width where needed.
      MuiDateCalendar: {
        styleOverrides: {
          root: {
            width: '100%',
            maxHeight: 400,
          },
        },
      },
      MuiDayCalendar: {
        styleOverrides: {
          // Force both the weekday header and every day row onto the same
          // 7-column CSS grid so labels and numbers align exactly.
          header: {
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            justifyItems: 'center',
          },
          weekContainer: {
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            justifyItems: 'center',
            margin: '2px 0',
          },
          weekDayLabel: {
            width: 44,
            height: 32,
            margin: 0,
            fontSize: '0.95rem',
          },
        },
      },
      MuiPickersDay: {
        styleOverrides: {
          root: {
            width: 44,
            height: 44,
            margin: 0,
            fontSize: '1.05rem',
          },
        },
      },
      MuiPickersSlideTransition: {
        styleOverrides: {
          root: { minHeight: 280 },
        },
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Context & hook
// ---------------------------------------------------------------------------

export const ColorModeToggleContext = createContext<ColorModeToggle>({
  toggleColorMode: () => {},
});

export const FontScaleContext = createContext<FontScaleControl>({
  fontScale: 'medium',
  setFontScale: () => {},
});

export const useColorTheme = (): [Theme, ColorModeToggle, FontScaleControl] => {
  const [mode, setMode] = useState<PaletteMode>(() => {
    try {
      const stored = localStorage.getItem('themeMode');
      return stored === 'light' || stored === 'dark' ? stored : 'dark';
    } catch (e) {
      console.warn('Failed to read theme mode from localStorage', e);
      return 'dark';
    }
  });

  const [fontScale, setFontScaleState] = useState<FontScale>(() => {
    try {
      const stored = localStorage.getItem('fontScale');
      if (stored === 'small' || stored === 'medium' || stored === 'large' || stored === 'xlarge') {
        return stored;
      }
    } catch (e) {
      console.warn('Failed to read font scale from localStorage', e);
    }
    return 'medium';
  });

  const colorModeToggle = useMemo<ColorModeToggle>(
    () => ({
      toggleColorMode: () =>
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light';
          try {
            localStorage.setItem('themeMode', next);
          } catch (e) { console.warn('Failed to save theme mode to localStorage', e); }
          return next;
        }),
    }),
    [],
  );

  const fontScaleControl = useMemo<FontScaleControl>(
    () => ({
      fontScale,
      setFontScale: (scale) => {
        setFontScaleState(scale);
        try {
          localStorage.setItem('fontScale', scale);
        } catch (e) { console.warn('Failed to save font scale to localStorage', e); }
      },
    }),
    [fontScale],
  );

  const theme = useMemo(() => createTheme(themeSettings(mode, fontScale)), [mode, fontScale]);
  return [theme, colorModeToggle, fontScaleControl];
};
