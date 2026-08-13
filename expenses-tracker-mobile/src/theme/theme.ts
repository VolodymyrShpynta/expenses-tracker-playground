/**
 * Paper v5 (Material 3) theme — three neutral themes (light, dim, dark) and
 * four accented ones, built from the Spendium design tokens in `tokens.ts`.
 *
 * The neutral three are a port of the marketing site (`spendium-site`):
 * near-black `#0a0a0f` with charcoal `#15151c` cards in dark, off-white
 * `#fafafa` with pure-white cards in light, an indigo brand and a green accent
 * in both; dim is the dark palette lifted a step for a lit room. The accented
 * four each pair a tinted dark ramp with a brand colour of their own, so they
 * change the app's character rather than its brightness.
 *
 * Application code should consume **semantic** tokens
 * (`theme.colors.primaryContainer`, `theme.colors.outline`, …) — never
 * import from `tokens.ts` directly outside `src/theme/`.
 *
 * `colors.elevation.*` is filled in explicitly because Paper's `Surface`
 * reads it instead of `colors.surface`. MD3's default tints elevated
 * surfaces with `primary`, which leaves every card faintly purple; the
 * site steps between flat neutrals instead, so the levels below walk
 * `bgElev → bgSoft → …` with no tint.
 */
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

import { accents, brand, brandSurface, danger, green, surfaces, violet } from './tokens';
import type { SurfacePalette, ThemeAccent } from './tokens';
import { applyInterFonts } from './typography';

export type ThemeVariant =
  | 'light'
  | 'dim'
  | 'dark'
  | 'indigo'
  | 'emerald'
  | 'lime'
  | 'violet';

/**
 * `MD3Theme.dark` puts six of the seven themes in one bucket, so the variant is
 * carried explicitly for the places that need to tell them apart.
 */
export type AppTheme = MD3Theme & { readonly variant: ThemeVariant };

export const lightTheme: AppTheme = {
  ...MD3LightTheme,
  variant: 'light',
  fonts: applyInterFonts(MD3LightTheme.fonts),
  colors: {
    ...MD3LightTheme.colors,

    primary: brand[600],
    onPrimary: '#ffffff',
    primaryContainer: brandSurface.light[50],
    onPrimaryContainer: brand[700],

    secondary: green.strong,
    onSecondary: '#ffffff',
    secondaryContainer: green.soft,
    onSecondaryContainer: green.deep,

    tertiary: violet.deep,
    onTertiary: '#ffffff',
    tertiaryContainer: brandSurface.light[100],
    onTertiaryContainer: violet.deep,

    error: danger.base,
    onError: '#ffffff',
    errorContainer: danger.container.light,
    onErrorContainer: danger.on.light,

    background: surfaces.light.bg,
    onBackground: surfaces.light.text,
    surface: surfaces.light.bgElev,
    onSurface: surfaces.light.text,
    surfaceVariant: surfaces.light.bgSoft,
    onSurfaceVariant: surfaces.light.textMuted,

    outline: surfaces.light.borderStrong,
    outlineVariant: surfaces.light.border,
    backdrop: 'rgba(15, 23, 42, 0.4)',

    elevation: {
      level0: 'transparent',
      level1: surfaces.light.bgElev,
      level2: surfaces.light.bgElev,
      level3: '#fbfbfd',
      level4: '#f8f8fb',
      level5: surfaces.light.bgSoft,
    },
  },
};

/**
 * The dark themes differ in the neutral ramp they sit on and in the accent they
 * carry, so every other role is written once here. Elevation levels 3-5 are
 * passed in rather than derived: they are half-steps between the palette's own
 * stops.
 *
 * The accent supplies the *selection* roles as well as the brand ones. A
 * selected chip painted in the site's green while the buttons are lime would
 * read as a second brand rather than as a state, so a theme that doesn't name
 * a selection colour selects in its own accent.
 */
function darkVariant(
  variant: ThemeVariant,
  palette: SurfacePalette,
  elevation: { readonly level3: string; readonly level4: string; readonly level5: string },
  themeAccent: ThemeAccent,
): AppTheme {
  const selection = themeAccent.selection ?? {
    base: themeAccent.base,
    on: themeAccent.on,
    container: themeAccent.container,
    onContainer: themeAccent.onContainer,
    containerPressed: palette.bgSunkenStrong,
  };
  return {
    ...MD3DarkTheme,
    variant,
    fonts: applyInterFonts(MD3DarkTheme.fonts),
    colors: {
      ...MD3DarkTheme.colors,

      primary: themeAccent.base,
      onPrimary: themeAccent.on,
      primaryContainer: themeAccent.container,
      onPrimaryContainer: themeAccent.onContainer,

      secondary: selection.base,
      onSecondary: selection.on,
      secondaryContainer: selection.container,
      onSecondaryContainer: selection.onContainer,

      tertiary: selection.base,
      onTertiary: selection.on,
      tertiaryContainer: selection.containerPressed,
      onTertiaryContainer: selection.onContainer,

      error: danger.base,
      onError: '#ffffff',
      errorContainer: danger.container.dark,
      onErrorContainer: danger.on.dark,

      background: palette.bg,
      onBackground: palette.text,
      surface: palette.bgElev,
      onSurface: palette.text,
      surfaceVariant: palette.bgSoft,
      onSurfaceVariant: palette.textMuted,

      outline: palette.borderStrong,
      outlineVariant: palette.border,
      // Black, not `bg`. Scrimming the near-black page with its own colour is a
      // no-op wherever the page is empty, so an overlay painted in `bg` had no
      // edge at all. Black at this alpha pushes the page below the sheet.
      backdrop: 'rgba(0, 0, 0, 0.72)',

      elevation: {
        level0: 'transparent',
        level1: palette.bgElev,
        level2: palette.bgSoft,
        ...elevation,
      },
    },
  };
}

export const darkTheme = darkVariant(
  'dark',
  surfaces.dark,
  { level3: '#22222c', level4: '#262631', level5: '#2b2b37' },
  accents.brand,
);

export const dimTheme = darkVariant(
  'dim',
  surfaces.dim,
  { level3: '#2d2d3b', level4: '#333342', level5: '#3a3a4b' },
  accents.brand,
);

export const indigoTheme = darkVariant(
  'indigo',
  surfaces.indigo,
  { level3: '#20244f', level4: '#262b5c', level5: '#2d3269' },
  accents.indigo,
);

export const emeraldTheme = darkVariant(
  'emerald',
  surfaces.emerald,
  { level3: '#16291f', level4: '#1c3227', level5: '#223b2e' },
  accents.emerald,
);

export const limeTheme = darkVariant(
  'lime',
  surfaces.lime,
  { level3: '#202318', level4: '#282c1c', level5: '#2f3421' },
  accents.lime,
);

export const violetTheme = darkVariant(
  'violet',
  surfaces.violet,
  { level3: '#271c46', level4: '#2e214f', level5: '#352759' },
  accents.violet,
);

/** Every theme, in the order the picker offers them. */
export const themes: Record<ThemeVariant, AppTheme> = {
  light: lightTheme,
  dim: dimTheme,
  dark: darkTheme,
  indigo: indigoTheme,
  emerald: emeraldTheme,
  lime: limeTheme,
  violet: violetTheme,
};

/** What the user can choose: any theme, or letting the OS decide. */
export type ThemeMode = ThemeVariant | 'system';

/**
 * The single list of choices — the picker renders it and the stored preference
 * is validated against it, so a theme can't be pickable but not storable, or
 * the reverse.
 */
export const THEME_MODES: ReadonlyArray<ThemeMode> = [
  'system',
  ...(Object.keys(themes) as ThemeVariant[]),
];
