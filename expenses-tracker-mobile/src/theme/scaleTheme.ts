/**
 * Apply a font-scale multiplier to a Paper MD3 theme. Multiplies the
 * `fontSize` and `lineHeight` of every variant in `theme.fonts` so the
 * full type ramp scales uniformly.
 */
import type { MD3Theme } from 'react-native-paper';

type FontVariant = MD3Theme['fonts'][keyof MD3Theme['fonts']];

export function scaleTheme(theme: MD3Theme, scale: number): MD3Theme {
  if (scale === 1) return theme;
  const scaled: Record<string, FontVariant> = {};
  for (const [key, variant] of Object.entries(theme.fonts) as Array<[string, FontVariant]>) {
    if ('fontSize' in variant && typeof variant.fontSize === 'number') {
      const lineHeight = (variant as { lineHeight?: number }).lineHeight ?? variant.fontSize * 1.4;
      scaled[key] = {
        ...variant,
        fontSize: Math.round(variant.fontSize * scale),
        lineHeight: Math.round(lineHeight * scale),
      } as FontVariant;
    } else {
      scaled[key] = variant;
    }
  }
  return { ...theme, fonts: scaled as MD3Theme['fonts'] };
}
