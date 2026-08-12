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
  readonly opacity: number;
  /** Fraction of the ray at which the colour has fully faded out. */
  readonly fade: number;
}

export interface AppColors {
  /** Track behind a per-category percentage bar. */
  readonly progressTrackBg: string;
  /** Hairline that separates cards and chrome from the page. */
  readonly border: string;
  readonly borderStrong: string;
  /** Dimmest text tier — axis labels, secondary metadata. */
  readonly textDim: string;
  /** 135° indigo ramp used by every primary action. */
  readonly brandGradient: readonly [string, string];
  /** 135° ramp for headline text: page text → indigo → green. */
  readonly headingGradient: readonly [string, string, string];
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
 * `radial-gradient(60% 50% at 15% 10%, rgba(99,102,241,.20), transparent 60%)`
 * and its two siblings from the site's hero, expressed as data so
 * `AmbientGlow` can lay them out as SVG.
 */
const ambientGlow: ReadonlyArray<GlowStop> = [
  { cx: 0.15, cy: 0.1, rx: 0.6, ry: 0.5, color: brand[500], opacity: 0.2, fade: 0.6 },
  { cx: 0.85, cy: 0.2, rx: 0.5, ry: 0.45, color: accent.base, opacity: 0.16, fade: 0.65 },
  { cx: 0.5, cy: 1.0, rx: 0.7, ry: 0.6, color: violet.glow, opacity: 0.15, fade: 0.65 },
];

const shared = {
  brandGradient: [brand[500], brand[700]] as const,
  ambientGlow,
  brandGlow: shadow.brandGlow,
  brandGlowStrong: shadow.brandGlowStrong,
  brandHalo: shadow.brandHalo,
};

const lightAppColors: AppColors = {
  ...shared,
  progressTrackBg: 'rgba(15, 23, 42, 0.08)',
  border: surfaces.light.border,
  borderStrong: surfaces.light.borderStrong,
  textDim: surfaces.light.textDim,
  headingGradient: [surfaces.light.text, brand[600], accent.strong],
  eyebrowBg: '#eef0ff',
  eyebrowText: brand[600],
  shadowSm: shadow.light.sm,
};

const darkAppColors: AppColors = {
  ...shared,
  progressTrackBg: 'rgba(255, 255, 255, 0.08)',
  border: surfaces.dark.border,
  borderStrong: surfaces.dark.borderStrong,
  textDim: surfaces.dark.textDim,
  headingGradient: [surfaces.dark.text, brand[300], accent.base],
  eyebrowBg: '#1c1b3a',
  eyebrowText: brand[300],
  shadowSm: shadow.dark.sm,
};

export function useAppColors(): AppColors {
  const theme = useTheme();
  return theme.dark ? darkAppColors : lightAppColors;
}
