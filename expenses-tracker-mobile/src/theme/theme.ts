/**
 * Paper v5 (Material 3) theme — light + dark.
 *
 * Brand colors mirror `expenses-tracker-frontend/src/theme.ts` so the
 * two clients feel like the same product. The web theme uses MUI design
 * tokens; here we map the same scales onto the Material 3 role system
 * (`primary`, `*Container`, `surface`, `outline`, …).
 *
 * Application code should consume **semantic** tokens
 * (`theme.colors.primaryContainer`, `theme.colors.outline`, …) — never
 * import from `palette.ts` directly. Paper v3 already provides every
 * MD3 role we need; we override only those that should reflect the
 * brand palette instead of Paper's default greys.
 */
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

import {
  baseWhite,
  blueAccent,
  greenAccent,
  grey,
  navy,
  redAccent,
} from './palette';

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,

    // Brand roles
    primary: blueAccent[700],
    onPrimary: baseWhite,
    primaryContainer: blueAccent[100],
    onPrimaryContainer: blueAccent[800],

    secondary: greenAccent[600],
    onSecondary: baseWhite,
    secondaryContainer: greenAccent[100],
    onSecondaryContainer: greenAccent[800],

    tertiary: greenAccent[500],
    onTertiary: baseWhite,
    tertiaryContainer: greenAccent[200],
    onTertiaryContainer: greenAccent[800],

    error: redAccent[500],
    onError: baseWhite,
    errorContainer: redAccent[100],
    onErrorContainer: redAccent[800],

    // Surfaces
    background: blueAccent[50],
    onBackground: grey[900],
    surface: baseWhite,
    onSurface: grey[900],
    surfaceVariant: grey[100],
    onSurfaceVariant: grey[700],

    // Outlines
    outline: grey[300],
    outlineVariant: grey[100],
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,

    // Brand roles
    primary: blueAccent[500],
    onPrimary: baseWhite,
    primaryContainer: blueAccent[800],
    onPrimaryContainer: blueAccent[100],

    secondary: greenAccent[400],
    onSecondary: navy[500],
    secondaryContainer: greenAccent[800],
    onSecondaryContainer: greenAccent[100],

    tertiary: greenAccent[500],
    onTertiary: navy[500],
    tertiaryContainer: greenAccent[700],
    onTertiaryContainer: greenAccent[200],

    error: redAccent[500],
    onError: baseWhite,
    errorContainer: redAccent[800],
    onErrorContainer: redAccent[100],

    // Surfaces
    background: navy[500],
    onBackground: grey[100],
    surface: navy[400],
    onSurface: grey[100],
    surfaceVariant: navy[400],
    onSurfaceVariant: grey[300],

    // Outlines
    outline: grey[500],
    outlineVariant: navy[400],
  },
};

