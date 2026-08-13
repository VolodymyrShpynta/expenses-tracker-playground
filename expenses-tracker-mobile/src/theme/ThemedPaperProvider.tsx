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
import { useColorScheme, type ColorSchemeName } from 'react-native';
import { useMemo } from 'react';
import { PaperProvider, adaptNavigationTheme } from 'react-native-paper';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import type { ReactNode } from 'react';

import { themes, type ThemeVariant } from './theme';
import { scaleTheme } from './scaleTheme';
import {
  FONT_SCALES,
  useFontScale,
  useThemeMode,
  type ThemeMode,
} from '../context/preferencesProvider';

export interface ThemedPaperProviderProps {
  readonly children: ReactNode;
}

const { LightTheme: AdaptedLightTheme, DarkTheme: AdaptedDarkTheme } =
  adaptNavigationTheme({
    reactNavigationLight: NavigationLightTheme,
    reactNavigationDark: NavigationDarkTheme,
  });

/**
 * The preference names one more choice than there are palettes, and the OS
 * reports only two. Exported so the status bar resolves the same way instead
 * of re-deriving "is it dark" from the raw preference.
 */
export function resolveThemeVariant(
  mode: ThemeMode,
  systemScheme: ColorSchemeName,
): ThemeVariant {
  if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return mode;
}

export function ThemedPaperProvider({ children }: ThemedPaperProviderProps) {
  const systemScheme = useColorScheme();
  const { themeMode } = useThemeMode();
  const { fontScale } = useFontScale();

  const theme = scaleTheme(
    themes[resolveThemeVariant(themeMode, systemScheme)],
    FONT_SCALES[fontScale],
  );

  // The ambient glow is painted once at the root, behind the navigator, so the
  // navigator's own container has to be transparent. Individual screens opt
  // back into it; see the stack's `screenOptions` for why the default is opaque.
  const navTheme: NavigationTheme = useMemo(() => {
    const adapted = theme.dark ? AdaptedDarkTheme : AdaptedLightTheme;
    return {
      ...adapted,
      colors: {
        ...adapted.colors,
        background: 'transparent',
        card: 'transparent',
        text: theme.colors.onSurface,
        border: theme.colors.outlineVariant,
        primary: theme.colors.primary,
      },
    };
  }, [theme]);

  return (
    <PaperProvider theme={theme}>
      <NavigationThemeProvider value={navTheme}>
        {children}
      </NavigationThemeProvider>
    </PaperProvider>
  );
}
