/**
 * Bridges the user's `themeMode` + `fontScale` prefs into the active
 * Paper theme. Sits *inside* `<PreferencesProvider>` so it can subscribe
 * to changes; sits *above* the rest of the UI so every screen sees the
 * resolved theme.
 *
 * Why a dedicated component? `<PaperProvider>` only accepts a `theme`
 * prop, so we need a node that re-renders the provider whenever the
 * preference changes. Doing this in `_layout.tsx` would couple the root
 * layout to every preference reader.
 *
 * **React Navigation theme bridge.** Paper components honor the Paper
 * theme, but every screen body (the area between the header and the
 * tab bar) is rendered by `@react-navigation/native`, which has its own
 * theme system. Without bridging, screen backgrounds fall back to RN's
 * light-grey default — making "dark mode" look broken (light body with
 * dark chrome). `adaptNavigationTheme` from Paper produces matching
 * navigation themes that we feed into the navigation `ThemeProvider`.
 */
import { useColorScheme } from 'react-native';
import { useMemo } from 'react';
import { PaperProvider, adaptNavigationTheme } from 'react-native-paper';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import type { ReactNode } from 'react';

import { darkTheme, lightTheme } from './theme';
import { scaleTheme } from './scaleTheme';
import { FONT_SCALES, useFontScale, useThemeMode } from '../context/preferencesProvider';

export interface ThemedPaperProviderProps {
  readonly children: ReactNode;
}

const { LightTheme: AdaptedLightTheme, DarkTheme: AdaptedDarkTheme } =
  adaptNavigationTheme({
    reactNavigationLight: NavigationLightTheme,
    reactNavigationDark: NavigationDarkTheme,
  });

export function ThemedPaperProvider({ children }: ThemedPaperProviderProps) {
  const systemScheme = useColorScheme();
  const { themeMode } = useThemeMode();
  const { fontScale } = useFontScale();

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const baseTheme = isDark ? darkTheme : lightTheme;
  const theme = scaleTheme(baseTheme, FONT_SCALES[fontScale]);

  // Overlay the project's brand background/surface tokens onto the
  // adapted nav theme so screen containers paint navy[500] in dark
  // mode (matching the web frontend) instead of Paper's MD3 grey.
  const navTheme: NavigationTheme = useMemo(() => {
    const adapted = isDark ? AdaptedDarkTheme : AdaptedLightTheme;
    return {
      ...adapted,
      colors: {
        ...adapted.colors,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.onSurface,
        border: theme.colors.outlineVariant,
        primary: theme.colors.primary,
      },
    };
  }, [isDark, theme]);

  return (
    <PaperProvider theme={theme}>
      <NavigationThemeProvider value={navTheme}>
        {children}
      </NavigationThemeProvider>
    </PaperProvider>
  );
}
