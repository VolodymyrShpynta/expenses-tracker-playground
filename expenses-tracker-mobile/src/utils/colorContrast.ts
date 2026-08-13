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

/**
 * Mixes a hex color towards white by `amount` (0–1) and returns hex.
 *
 * Used to build the second stop of a per-category gradient, so a slice or
 * bar has a lighter head and its base colour at the tail. Malformed input
 * is returned unchanged — a flat slice is a better failure than a crash.
 */
export function lighten(hex: string, amount: number): string {
  return mixTowards(hex, amount, 255);
}

/**
 * Mixes a hex color towards black by `amount` (0–1) and returns hex.
 *
 * Small amounts keep the colour's hue and its text contrast, which is what
 * makes this usable for a pressed state on a filled accent surface.
 */
export function darken(hex: string, amount: number): string {
  return mixTowards(hex, amount, 0);
}

function mixTowards(hex: string, amount: number, target: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const ratio = amount <= 0 ? 0 : amount >= 1 ? 1 : amount;
  const mix = (channel: number) => Math.round(channel + (target - channel) * ratio);
  return `#${[mix(rgb.r), mix(rgb.g), mix(rgb.b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * `'#6366f1'` → `'99, 102, 241'`, for composing `rgba(…)` strings.
 *
 * Malformed input yields black, which renders as an invisible shadow rather
 * than a wrong-coloured one.
 */
export function rgbTriplet(hex: string): string {
  const rgb = parseHex(hex);
  return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '0, 0, 0';
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 3 && cleaned.length !== 6) return null;
  const full =
    cleaned.length === 3
      ? cleaned.split('').map((c) => c + c).join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}
