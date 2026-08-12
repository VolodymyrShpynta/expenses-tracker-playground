/**
 * Paper v5 (Material 3) theme — light + dark, built from the Spendium
 * design tokens in `tokens.ts`.
 *
 * The palette is a port of the marketing site (`spendium-site`): near-black
 * `#0a0a0f` with charcoal `#15151c` cards in dark, off-white `#fafafa` with
 * pure-white cards in light, an indigo brand and a green accent in both.
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

import { accent, brand, brandSurface, danger, surfaces, violet } from './tokens';
import { applyInterFonts } from './typography';

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  fonts: applyInterFonts(MD3LightTheme.fonts),
  colors: {
    ...MD3LightTheme.colors,

    primary: brand[600],
    onPrimary: '#ffffff',
    primaryContainer: brandSurface.light[50],
    onPrimaryContainer: brand[700],

    secondary: accent.strong,
    onSecondary: '#ffffff',
    secondaryContainer: accent.soft,
    onSecondaryContainer: accent.deep,

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

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  fonts: applyInterFonts(MD3DarkTheme.fonts),
  colors: {
    ...MD3DarkTheme.colors,

    primary: brand[500],
    onPrimary: '#ffffff',
    primaryContainer: brandSurface.dark[50],
    onPrimaryContainer: brand[300],

    // `accent.base` is the site's dark-background green, but the site uses it
    // for hairlines and glyphs. As a *fill* it carries ~2.2x the luminance of
    // the indigo beside it, so a tile or button in it glares on near-black.
    secondary: accent.strong,
    onSecondary: '#04150a',
    secondaryContainer: accent.deep,
    onSecondaryContainer: accent.soft,

    tertiary: violet.glow,
    onTertiary: '#ffffff',
    tertiaryContainer: brandSurface.dark[100],
    onTertiaryContainer: brand[300],

    error: danger.base,
    onError: '#ffffff',
    errorContainer: danger.container.dark,
    onErrorContainer: danger.on.dark,

    background: surfaces.dark.bg,
    onBackground: surfaces.dark.text,
    surface: surfaces.dark.bgElev,
    onSurface: surfaces.dark.text,
    surfaceVariant: surfaces.dark.bgSoft,
    onSurfaceVariant: surfaces.dark.textMuted,

    outline: surfaces.dark.borderStrong,
    outlineVariant: surfaces.dark.border,
    // Black, not `bg`. Scrimming the near-black page with its own colour is a
    // no-op wherever the page is empty, so an overlay painted in `bg` had no
    // edge at all. Black at this alpha pushes the page below the sheet.
    backdrop: 'rgba(0, 0, 0, 0.72)',

    elevation: {
      level0: 'transparent',
      level1: surfaces.dark.bgElev,
      level2: surfaces.dark.bgSoft,
      level3: '#22222c',
      level4: '#262631',
      level5: '#2b2b37',
    },
  },
};
