/**
 * App-specific semantic tokens that aren't part of Paper's MD3 role
 * system — gradients, glows and the two list-surface washes.
 *
 * Everything here derives from `tokens.ts`, which is itself a port of the
 * marketing site's stylesheet. Use these instead of inline `rgba(…)`
 * literals so each light/dark pair stays in one place.
 */
import { useTheme } from 'react-native-paper';

import { accent, brand, shadow, surfaces, violet } from './tokens';

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
  indigo: { cx: 0.15, cy: 0.1, rx: 0.6, ry: 0.5, color: brand[500] },
  green: { cx: 0.85, cy: 0.2, rx: 0.5, ry: 0.45, color: accent.base },
  violet: { cx: 0.5, cy: 1.0, rx: 0.7, ry: 0.6, color: violet.glow },
} as const;

type GlowKey = keyof typeof glowGeometry;

/** Peak alpha per wash, at the ellipse centre. */
function glowsAt(peakAlpha: Record<GlowKey, number>): ReadonlyArray<GlowStop> {
  return (Object.keys(glowGeometry) as ReadonlyArray<GlowKey>).map((key) => ({
    ...glowGeometry[key],
    opacity: peakAlpha[key],
  }));
}

const shared = {
  brandGradient: [brand[500], brand[700]] as const,
  brandGlow: shadow.brandGlow,
  brandGlowStrong: shadow.brandGlowStrong,
  brandHalo: shadow.brandHalo,
};

const lightAppColors: AppColors = {
  ...shared,
  ambientGlow: glowsAt({ indigo: 0.064, green: 0.052, violet: 0.048 }),
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
  ambientGlow: glowsAt({ indigo: 0.13, green: 0.05, violet: 0.09 }),
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

export function useAppColors(): AppColors {
  const theme = useTheme();
  return theme.dark ? darkAppColors : lightAppColors;
}
