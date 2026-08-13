/**
 * Guards for the parallel lists a theme spans.
 *
 * Adding a theme means touching a palette, an accent, the `themes` table and a
 * label in every locale. TypeScript covers the tables; these cover the rest,
 * because the failure modes are silent — a theme missing from `THEME_MODES` is
 * simply unpickable, and one missing a label renders its i18n key.
 *
 * The contrast checks exist because the accents were hand-picked against their
 * `on` colours; the ratios were verified once by eye and belong in an assertion
 * rather than in someone's memory.
 */
import { describe, expect, it, vi } from 'vitest';

import en from '../i18n/locales/en.json';
import { THEME_MODES, themes, type ThemeVariant } from './theme';

// Paper's source doesn't parse under this suite's Node transform, and the
// themes overwrite every role these guards read, so an empty MD3 base is all
// that's needed to assemble them.
vi.mock('react-native-paper', () => {
  const base = { dark: false, roundness: 0, colors: {}, fonts: {}, animation: { scale: 1 } };
  return { MD3LightTheme: base, MD3DarkTheme: { ...base, dark: true } };
});

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const variants = Object.keys(themes) as ThemeVariant[];

/** Text sitting directly on a page or card. */
const TEXT_PAIRS = [
  ['onSurface', 'surface'],
  ['onBackground', 'background'],
  ['onSurfaceVariant', 'surfaceVariant'],
] as const;

/** Glyphs on a filled control, where WCAG's non-text / large-text bar applies. */
const FILL_PAIRS = [
  ['onPrimary', 'primary'],
  ['onSecondary', 'secondary'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondaryContainer', 'secondaryContainer'],
  ['onTertiaryContainer', 'tertiaryContainer'],
] as const;

describe('themes', () => {
  it('should offer every theme as a mode, plus following the system', () => {
    expect([...THEME_MODES].sort()).toEqual(['system', ...variants].sort());
  });

  it('should tag each theme with the key it is registered under', () => {
    for (const variant of variants) {
      expect(themes[variant].variant).toBe(variant);
    }
  });

  it('should label every mode in the base locale', () => {
    for (const mode of THEME_MODES) {
      expect(en.settings.themeMode).toHaveProperty(mode);
      expect(en.settings.themeMode[mode as keyof typeof en.settings.themeMode]).toBeTruthy();
    }
  });

  it.each(variants)('should keep %s readable where text meets a surface', (variant) => {
    for (const [on, surface] of TEXT_PAIRS) {
      const ratio = contrast(themes[variant].colors[on], themes[variant].colors[surface]);
      expect(ratio, `${variant}: ${on} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(variants)('should keep %s readable where glyphs meet a fill', (variant) => {
    for (const [on, fill] of FILL_PAIRS) {
      const ratio = contrast(themes[variant].colors[on], themes[variant].colors[fill]);
      expect(ratio, `${variant}: ${on} on ${fill}`).toBeGreaterThanOrEqual(3);
    }
  });
});
