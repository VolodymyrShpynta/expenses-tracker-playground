/**
 * Color contrast helpers — pure, presentation-agnostic.
 *
 * Kept dependency-free (no React, no React Native) so they can be
 * unit-tested with Vitest alongside the rest of `src/utils/`.
 */

/**
 * Returns a high-contrast text color (black or white) suitable for
 * rendering on top of the given hex background. Falls back to white
 * for malformed inputs.
 *
 * Uses sRGB-weighted luminance with a 160 threshold — calibrated
 * against the Material 3 category-tile palette so mid-range colors
 * (e.g. `#B0BEC5`) read as light backgrounds and pick black text.
 */
export function contrastTextColor(hex: string): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 3 && cleaned.length !== 6) return '#ffffff';
  const full =
    cleaned.length === 3
      ? cleaned.split('').map((c) => c + c).join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#ffffff';
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 160 ? '#000000' : '#ffffff';
}
