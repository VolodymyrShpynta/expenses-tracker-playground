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

export const themeSettings = (mode: PaletteMode) => {
  const isDark = mode === 'dark';

  const paperBg = isDark ? navy[400] : '#ffffff';
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
      fontSize: 12,
      h1: { fontSize: 40, fontWeight: 700 },
      h2: { fontSize: 32, fontWeight: 700 },
      h3: { fontSize: 24, fontWeight: 600 },
      h4: { fontSize: 20, fontWeight: 600 },
      h5: { fontSize: 16, fontWeight: 500 },
      h6: { fontSize: 14, fontWeight: 500 },
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
    },
  };
};

// ---------------------------------------------------------------------------
// Context & hook
// ---------------------------------------------------------------------------

export const ColorModeToggleContext = createContext<ColorModeToggle>({
  toggleColorMode: () => {},
});

export const useColorTheme = (): [Theme, ColorModeToggle] => {
  const [mode, setMode] = useState<PaletteMode>(() => {
    const stored = localStorage.getItem('themeMode');
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });

  const colorModeToggle = useMemo<ColorModeToggle>(
    () => ({
      toggleColorMode: () =>
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light';
          localStorage.setItem('themeMode', next);
          return next;
        }),
    }),
    [],
  );

  const theme = useMemo(() => createTheme(themeSettings(mode)), [mode]);
  return [theme, colorModeToggle];
};
