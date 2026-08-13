/**
 * Spendium design tokens — the single source of truth for colour, radius
 * and shadow in this app.
 *
 * Values are transcribed verbatim from the marketing site's stylesheet
 * (`spendium-site/_sass/spendium.scss`) so the app and the landing page
 * are recognisably the same product. Treat this file as a port of that
 * stylesheet: when the site's palette changes, change it here, don't
 * "improve" the numbers locally.
 *
 * Application code consumes **semantic** colour tokens — `useTheme().colors.*`
 * for MD3 roles and `useAppColors()` for the app-specific ones — so the raw
 * colour ramps below are for `src/theme/` only. `radius` and `shadow` have no
 * semantic layer and are imported directly by components.
 */
import { rgbTriplet } from '../utils/colorContrast';

/** Indigo brand ramp. Identical in light and dark — only `50`/`100` flip. */
export const brand = {
  300: '#a5acff',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
} as const;

/** Pale indigo used behind eyebrows and icon tiles. */
export const brandSurface = {
  light: { 50: '#eef0ff', 100: '#e0e3ff' },
  dark: { 50: '#1c1b3a', 100: '#25234c' },
} as const;

/** Green accent — logo chart, checkmarks, positive states. */
export const green = {
  /** On dark backgrounds. */
  base: '#22c55e',
  /** Darkened for contrast on white. */
  strong: '#16a34a',
  soft: '#d1fae5',
  deep: '#14532d',
} as const;

/** Violet used by the ambient glow and the deep end of the CTA band. */
export const violet = {
  glow: '#a855f7',
  deep: '#6d28d9',
} as const;

/** Red family — the site defines no error colour, so this follows its slate/Tailwind lineage. */
export const danger = {
  base: '#ef4444',
  container: { light: '#fee2e2', dark: '#7f1d1d' },
  on: { light: '#7f1d1d', dark: '#fee2e2' },
} as const;

export const surfaces = {
  light: {
    bg: '#fafafa',
    bgElev: '#ffffff',
    bgSoft: '#f4f4f7',
    // Recessed *below* the page rather than raised above it. The site has no
    // equivalent — these follow its slate lineage, far enough from `bg` to
    // delimit a control without an outline.
    bgSunken: '#e6eaf1',
    bgSunkenStrong: '#d6dce7',
    border: 'rgba(15, 23, 42, 0.08)',
    borderStrong: 'rgba(15, 23, 42, 0.14)',
    text: '#0f172a',
    textMuted: '#475569',
    textDim: '#64748b',
  },
  dark: {
    bg: '#0a0a0f',
    bgElev: '#15151c',
    bgSoft: '#1c1c25',
    bgSunken: '#23232f',
    bgSunkenStrong: '#2e2e3d',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    text: '#f1f5f9',
    textMuted: '#cbd5e1',
    textDim: '#94a3b8',
  },
  /**
   * A dark theme that stops short of the site's near-black — every neutral
   * raised about one step, same hue, same text ramp. For a lit room, where
   * `dark`'s `#0a0a0f` reads as a hole in the screen rather than as a page.
   *
   * Both hairlines are stronger than `dark`'s: a white hairline loses contrast
   * as the surface under it lightens, so holding the same alpha would make
   * card edges disappear.
   */
  dim: {
    bg: '#16161f',
    bgElev: '#1f1f2b',
    bgSoft: '#272734',
    bgSunken: '#30303f',
    bgSunkenStrong: '#3a3a4b',
    border: 'rgba(255, 255, 255, 0.10)',
    borderStrong: 'rgba(255, 255, 255, 0.20)',
    text: '#f1f5f9',
    textMuted: '#cbd5e1',
    textDim: '#94a3b8',
  },
  /**
   * The four themes below are *accented*: each pairs a tinted neutral ramp with
   * a brand colour of its own (see `accents`), so the app changes character and
   * not just brightness. Every one keeps the near-black lineage of `dark` — the
   * tint sits in the surfaces, never in the text, which stays a near-white of
   * the same hue so it reads as paper-under-light rather than as coloured ink.
   */
  indigo: {
    bg: '#0e1030',
    bgElev: '#171a3f',
    bgSoft: '#1f2350',
    bgSunken: '#282d63',
    bgSunkenStrong: '#333976',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.2)',
    text: '#eef0ff',
    textMuted: '#c2c7f0',
    textDim: '#9298cc',
  },
  emerald: {
    bg: '#05100c',
    bgElev: '#0c1c16',
    bgSoft: '#12261d',
    bgSunken: '#1a3328',
    bgSunkenStrong: '#234233',
    border: 'rgba(255, 255, 255, 0.09)',
    borderStrong: 'rgba(255, 255, 255, 0.18)',
    text: '#e8f5ee',
    textMuted: '#bcd6c8',
    textDim: '#8fae9d',
  },
  lime: {
    bg: '#0a0b07',
    bgElev: '#14160f',
    bgSoft: '#1c1f14',
    bgSunken: '#262a1b',
    bgSunkenStrong: '#333823',
    border: 'rgba(255, 255, 255, 0.09)',
    borderStrong: 'rgba(255, 255, 255, 0.18)',
    text: '#f4f6ec',
    textMuted: '#d2d6c2',
    textDim: '#a3a992',
  },
  violet: {
    bg: '#0f0a1c',
    bgElev: '#191130',
    bgSoft: '#22183f',
    bgSunken: '#2d2152',
    bgSunkenStrong: '#3a2c68',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.2)',
    text: '#f2ecff',
    textMuted: '#d4c9ee',
    textDim: '#a99ccb',
  },
} as const;

/** One neutral ramp, widened from the literals so themes can take any of them. */
export type SurfacePalette = { readonly [K in keyof typeof surfaces.dark]: string };

/**
 * A theme's brand colour, in the forms the app draws it in: a fill, the two
 * ends of the 135° gradient, and a tinted container.
 */
export interface ThemeAccent {
  /** Fill for primary actions, and the light end of the gradient. */
  readonly base: string;
  /** Deep end of the gradient. */
  readonly deep: string;
  /** Text and glyphs drawn on `base`. */
  readonly on: string;
  /** Tinted plate for eyebrows and containers. */
  readonly container: string;
  readonly onContainer: string;
  /**
   * Colours for *state* rather than for the brand: a selected chip, the
   * equals key, a pressed operator key. Omitted means "the accent itself",
   * which is what a single-accent theme wants; the neutral themes carry the
   * site's green here, because on them selection is a different colour from
   * the brand.
   */
  readonly selection?: ThemeSelection;
}

export interface ThemeSelection {
  readonly base: string;
  readonly on: string;
  readonly container: string;
  readonly onContainer: string;
  /** The container while it is held down. */
  readonly containerPressed: string;
}

export const accents = {
  /** The site's indigo, worn by the light, dim and dark themes. */
  brand: {
    base: brand[500],
    deep: brand[700],
    on: '#ffffff',
    container: brandSurface.dark[50],
    onContainer: brand[300],
    // The site selects in green, not in its own indigo. As a *fill* the
    // dark-background green carries ~2.2x the luminance of the indigo beside
    // it, so `strong` is used instead — `base` glares on near-black.
    selection: {
      base: green.strong,
      on: '#04150a',
      container: green.deep,
      onContainer: green.soft,
      containerPressed: brandSurface.dark[100],
    },
  },
  indigo: {
    base: '#5b5cf6',
    deep: '#3730a3',
    on: '#ffffff',
    container: '#2b2f75',
    onContainer: '#c7caff',
  },
  emerald: {
    base: '#2ec894',
    deep: '#0f7a58',
    on: '#04150a',
    container: '#134e3a',
    onContainer: '#a7f3d0',
  },
  /** The one accent bright enough to need dark glyphs on top of it. */
  lime: {
    base: '#c8f53f',
    deep: '#7fa716',
    on: '#141a00',
    container: '#3c4a12',
    onContainer: '#dcff8f',
  },
  violet: {
    base: '#a855f7',
    deep: '#6d28d9',
    on: '#ffffff',
    container: '#4c1d95',
    onContainer: '#e9d5ff',
  },
} as const satisfies Record<string, ThemeAccent>;

/**
 * Corner radii. The site's `--radius-*` scale, plus a small step for
 * chips and progress tracks which the site has no equivalent for.
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 22,
  xl: 32,
  pill: 999,
} as const;

/**
 * Shadows as CSS `box-shadow` strings.
 *
 * React Native 0.76+ on the New Architecture supports the `boxShadow`
 * style prop, which is the only way to get a *coloured* shadow on
 * Android — `elevation` always draws a neutral grey. The site's identity
 * leans on indigo glow, so the CSS string is the primary form and
 * `elevation` is only used where a plain drop shadow will do.
 */
export const shadow = {
  light: {
    sm: '0px 1px 2px rgba(15, 23, 42, 0.06)',
    md: '0px 4px 14px rgba(15, 23, 42, 0.08)',
    lg: '0px 20px 50px rgba(67, 56, 202, 0.18)',
  },
  dark: {
    sm: '0px 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0px 4px 14px rgba(0, 0, 0, 0.45)',
    lg: '0px 20px 50px rgba(0, 0, 0, 0.55)',
  },
} as const;

/**
 * The glow under the primary action, in the accent of whichever theme is live —
 * on this design the shadow carries the brand as much as the fill does.
 */
export function accentGlow(hex: string) {
  const rgb = rgbTriplet(hex);
  return {
    glow: `0px 12px 24px rgba(${rgb}, 0.35)`,
    glowStrong: `0px 16px 32px rgba(${rgb}, 0.45)`,
    /** The hero icon's oversized halo. */
    halo: `0px 24px 48px rgba(${rgb}, 0.45)`,
  };
}
