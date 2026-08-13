/**
 * App-specific semantic tokens that aren't part of Paper's MD3 role
 * system — gradients, glows and the two list-surface washes.
 *
 * Everything here derives from `tokens.ts`, which is itself a port of the
 * marketing site's stylesheet. Use these instead of inline `rgba(…)`
 * literals so each light/dark pair stays in one place.
 */
import { useTheme } from 'react-native-paper';

import type { AppTheme, ThemeVariant } from './theme';
import { darken } from '../utils/colorContrast';
import {
  accentGlow,
  accents,
  brand,
  green,
  shadow,
  surfaces,
  violet,
  type SurfacePalette,
  type ThemeAccent,
} from './tokens';

/** One ellipse of the ambient background glow. Fractions of the container. */
export interface GlowStop {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly color: string;
  /** Peak alpha at the ellipse centre; it eases to 0 at the edge. */
  readonly opacity: number;
}

export interface AppColors {
  /** Track behind a per-category percentage bar. */
  readonly progressTrackBg: string;
  /** A control sunk *below* the page — keypad keys and the like. Far enough
   *  from the page colour to delimit itself without an outline. */
  readonly surfaceSunken: string;
  readonly surfaceSunkenPressed: string;
  /** Hairline that separates cards and chrome from the page. */
  readonly border: string;
  readonly borderStrong: string;
  /** Dimmest text tier — axis labels, secondary metadata. */
  readonly textDim: string;
  /** 135° indigo ramp used by every primary action. */
  readonly brandGradient: readonly [string, string];
  /** A filled accent surface while it is held down. */
  readonly accentPressed: string;
  /** The three radial washes behind every screen. */
  readonly ambientGlow: ReadonlyArray<GlowStop>;
  /** Small uppercase eyebrow pill. */
  readonly eyebrowBg: string;
  readonly eyebrowText: string;
  readonly shadowSm: string;
  readonly brandGlow: string;
  readonly brandGlowStrong: string;
  readonly brandHalo: string;
}

/**
 * The site's three hero washes — `radial-gradient(60% 50% at 15% 10%, …)` and
 * its siblings — as data, so `AmbientGlow` can lay them out as SVG.
 *
 * Keyed by position, because the hue moves: an accented theme lights its page
 * with its own accent rather than with the site's indigo.
 *
 * Geometry is shared between themes; the alphas are not, and they are not a
 * single dial either. Two effects pull in opposite directions:
 *
 *  - On a near-white page the washes shift *hue* (white → lavender), which is
 *    far more conspicuous than the luminance shift they cause on a near-black
 *    one, so light mode runs much weaker overall than the stylesheet's values.
 *  - Against near-black, green carries ~2.5× the perceived luminance of the
 *    indigo at equal alpha, so an even dial leaves it reading as a bright patch
 *    rather than as ambient light. Dark mode therefore weights per hue.
 */
const glowGeometry = {
  topLeft: { cx: 0.15, cy: 0.1, rx: 0.6, ry: 0.5, color: brand[500] },
  topRight: { cx: 0.85, cy: 0.2, rx: 0.5, ry: 0.45, color: green.base },
  bottom: { cx: 0.5, cy: 1.0, rx: 0.7, ry: 0.6, color: violet.glow },
} as const;

type GlowKey = keyof typeof glowGeometry;

/**
 * Peak alpha per wash, at the ellipse centre; `hue` re-colours a wash for the
 * accented themes.
 */
function glowsAt(
  peakAlpha: Record<GlowKey, number>,
  hue: Partial<Record<GlowKey, string>> = {},
): ReadonlyArray<GlowStop> {
  return (Object.keys(glowGeometry) as ReadonlyArray<GlowKey>).map((key) => ({
    ...glowGeometry[key],
    ...(hue[key] ? { color: hue[key] } : {}),
    opacity: peakAlpha[key],
  }));
}

const brandGlows = accentGlow(accents.brand.base);

const shared = {
  brandGradient: [accents.brand.base, accents.brand.deep] as const,
  brandGlow: brandGlows.glow,
  brandGlowStrong: brandGlows.glowStrong,
  brandHalo: brandGlows.halo,
};

const lightAppColors: AppColors = {
  ...shared,
  accentPressed: brand[600],
  ambientGlow: glowsAt({ topLeft: 0.064, topRight: 0.052, bottom: 0.048 }),
  progressTrackBg: 'rgba(15, 23, 42, 0.08)',
  surfaceSunken: surfaces.light.bgSunken,
  surfaceSunkenPressed: surfaces.light.bgSunkenStrong,
  border: surfaces.light.border,
  borderStrong: surfaces.light.borderStrong,
  textDim: surfaces.light.textDim,
  eyebrowBg: '#eef0ff',
  eyebrowText: brand[600],
  shadowSm: shadow.light.sm,
};

const darkAppColors: AppColors = {
  ...shared,
  accentPressed: brand[500],
  ambientGlow: glowsAt({ topLeft: 0.13, topRight: 0.05, bottom: 0.09 }),
  progressTrackBg: 'rgba(255, 255, 255, 0.08)',
  surfaceSunken: surfaces.dark.bgSunken,
  surfaceSunkenPressed: surfaces.dark.bgSunkenStrong,
  border: surfaces.dark.border,
  borderStrong: surfaces.dark.borderStrong,
  textDim: surfaces.dark.textDim,
  eyebrowBg: '#1c1b3a',
  eyebrowText: brand[300],
  shadowSm: shadow.dark.sm,
};

const dimAppColors: AppColors = {
  ...shared,
  accentPressed: brand[500],
  // Each wash is a luminance shift, so it reads stronger the further the page
  // is from black. Dim runs weaker than dark to stay ambient light rather than
  // becoming three visible patches.
  ambientGlow: glowsAt({ topLeft: 0.1, topRight: 0.04, bottom: 0.07 }),
  progressTrackBg: 'rgba(255, 255, 255, 0.1)',
  surfaceSunken: surfaces.dim.bgSunken,
  surfaceSunkenPressed: surfaces.dim.bgSunkenStrong,
  border: surfaces.dim.border,
  borderStrong: surfaces.dim.borderStrong,
  textDim: surfaces.dim.textDim,
  eyebrowBg: '#25234c',
  eyebrowText: brand[300],
  shadowSm: shadow.dark.sm,
};

/**
 * Everything an accented theme needs follows from its ramp and its accent: the
 * gradient and the glow are the accent, the eyebrow is its container, and the
 * indigo wash becomes the accent so the page isn't lit by a colour the theme
 * doesn't otherwise use. The other two washes stay put — three washes in one
 * hue is a vignette, not ambience.
 */
function accentedColors(palette: SurfacePalette, themeAccent: ThemeAccent): AppColors {
  const glows = accentGlow(themeAccent.base);
  return {
    brandGradient: [themeAccent.base, themeAccent.deep],
    // A sixth of the way to black: enough to read as a press, small enough that
    // the glyphs keep the contrast they were chosen for against `base`.
    accentPressed: darken(themeAccent.base, 0.17),
    brandGlow: glows.glow,
    brandGlowStrong: glows.glowStrong,
    brandHalo: glows.halo,
    ambientGlow: glowsAt(
      { topLeft: 0.12, topRight: 0.045, bottom: 0.075 },
      { topLeft: themeAccent.base },
    ),
    progressTrackBg: 'rgba(255, 255, 255, 0.09)',
    surfaceSunken: palette.bgSunken,
    surfaceSunkenPressed: palette.bgSunkenStrong,
    border: palette.border,
    borderStrong: palette.borderStrong,
    textDim: palette.textDim,
    eyebrowBg: themeAccent.container,
    eyebrowText: themeAccent.onContainer,
    shadowSm: shadow.dark.sm,
  };
}

const APP_COLORS: Record<ThemeVariant, AppColors> = {
  light: lightAppColors,
  dim: dimAppColors,
  dark: darkAppColors,
  indigo: accentedColors(surfaces.indigo, accents.indigo),
  emerald: accentedColors(surfaces.emerald, accents.emerald),
  lime: accentedColors(surfaces.lime, accents.lime),
  violet: accentedColors(surfaces.violet, accents.violet),
};

export function useAppColors(): AppColors {
  const { variant, dark } = useTheme<AppTheme>();
  // The fallback is for a component rendered outside the app's own provider,
  // where Paper hands out a stock theme with no variant on it.
  return APP_COLORS[variant] ?? (dark ? darkAppColors : lightAppColors);
}
