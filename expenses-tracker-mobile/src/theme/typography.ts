/**
 * Inter typography — the site's typeface, mapped onto Paper's MD3 type scale.
 *
 * Two things make the landing page's headings read the way they do:
 * Inter at weight 800, and **negative tracking** (`-0.035em` on the hero,
 * `-0.025em` on section headings). Both are reproduced per variant below.
 *
 * Weight is expressed as a **font family**, never `fontWeight`. Android
 * cannot pick a weight out of separately-registered font files, so a
 * `fontWeight: '700'` on top of `Inter_400Regular` yields either the
 * regular face or a synthesised fake-bold. Every weight therefore has its
 * own family name, and `fontWeight` is pinned to `normal` so the platform
 * never doubles up.
 */
import type { MD3Theme } from 'react-native-paper';

export const interFont = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

type FontVariant = MD3Theme['fonts'][keyof MD3Theme['fonts']];

/**
 * Damps the user's font-scale preference for display-sized text.
 *
 * The preference exists so *body* text stays readable; a 40px hero number
 * already is, so the last step of the scale buys almost no legibility there
 * while costing a lot of vertical space. It costs more than it looks, too:
 * `adjustsFontSizeToFit` shrinks the glyphs to fit a narrow screen but the
 * line box keeps its full height, so a hero always reserves its worst case.
 *
 * Half the step, so xlarge lands on 1.15 rather than 1.3.
 */
export function displayFontScale(scale: number): number {
  return 1 + (scale - 1) * 0.5;
}

/** Tracking as a fraction of font size, matching the site's `em` values. */
const TRACKING = {
  display: -0.035,
  headline: -0.035,
  title: -0.02,
  body: 0,
  label: 0,
} as const;

const FAMILY = {
  display: interFont.extraBold,
  headline: interFont.extraBold,
  title: interFont.bold,
  body: interFont.regular,
  label: interFont.semiBold,
} as const;

function categoryOf(variant: string): keyof typeof FAMILY {
  if (variant.startsWith('display')) return 'display';
  if (variant.startsWith('headline')) return 'headline';
  if (variant.startsWith('title')) return 'title';
  if (variant.startsWith('label')) return 'label';
  return 'body';
}

/** Re-skin an MD3 type scale with Inter families and the site's tracking. */
export function applyInterFonts(fonts: MD3Theme['fonts']): MD3Theme['fonts'] {
  const next: Record<string, FontVariant> = {};
  for (const [variant, style] of Object.entries(fonts) as Array<[string, FontVariant]>) {
    const category = categoryOf(variant);
    const fontSize = 'fontSize' in style ? style.fontSize : undefined;
    next[variant] = {
      ...style,
      fontFamily: FAMILY[category],
      fontWeight: 'normal',
      ...(typeof fontSize === 'number'
        ? { letterSpacing: round2(fontSize * TRACKING[category]) }
        : {}),
    } as FontVariant;
  }
  return next as MD3Theme['fonts'];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
