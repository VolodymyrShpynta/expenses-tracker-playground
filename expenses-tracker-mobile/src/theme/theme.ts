/**
 * Paper v5 (Material 3) theme — light + dark.
 *
 * Brand colors mirror `expenses-tracker-frontend/src/theme.ts` so the two
 * clients feel like the same product. The web theme uses MUI design
 * tokens; here we map the same color scales onto Material 3 roles
 * (`primary`, `secondary`, `error`, `surface`, …).
 *
 * NOTE: Paper v5 is the only supported version — the v4 `Theme` shape and
 * `defaultTheme` are NOT available. Always extend `MD3LightTheme` /
 * `MD3DarkTheme` and never spread `DefaultTheme`.
 */
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

const blueAccent = {
  500: '#6870fa',
  700: '#3e4396',
} as const;

const greenAccent = {
  400: '#70d8bd',
  500: '#4cceac',
  600: '#3da58a',
} as const;

const redAccent = {
  500: '#db4f4a',
} as const;

const navy = {
  400: '#1F2A40',
  500: '#141b2d',
} as const;

const grey = {
  100: '#e0e0e0',
  300: '#a3a3a3',
  700: '#3d3d3d',
  900: '#141414',
} as const;

const blueAccentLight = '#f9f8ff';

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: blueAccent[700],
    onPrimary: '#ffffff',
    secondary: greenAccent[600],
    onSecondary: '#ffffff',
    tertiary: greenAccent[500],
    error: redAccent[500],
    background: blueAccentLight,
    surface: '#ffffff',
    onSurface: grey[900],
    onSurfaceVariant: grey[700],
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: blueAccent[500],
    onPrimary: '#ffffff',
    secondary: greenAccent[400],
    onSecondary: navy[500],
    tertiary: greenAccent[500],
    error: redAccent[500],
    background: navy[500],
    surface: navy[400],
    onSurface: grey[100],
    onSurfaceVariant: grey[300],
  },
};
