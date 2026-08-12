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
export const accent = {
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
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    text: '#f1f5f9',
    textMuted: '#cbd5e1',
    textDim: '#94a3b8',
  },
} as const;

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
  /** Indigo glow under the primary button — same in both themes. */
  brandGlow: '0px 12px 24px rgba(99, 102, 241, 0.35)',
  brandGlowStrong: '0px 16px 32px rgba(99, 102, 241, 0.45)',
  /** The hero icon's oversized halo. */
  brandHalo: '0px 24px 48px rgba(99, 102, 241, 0.45)',
} as const;
