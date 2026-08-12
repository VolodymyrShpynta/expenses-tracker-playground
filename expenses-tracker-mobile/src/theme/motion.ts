/**
 * Motion tokens, ported from the site's transitions.
 *
 * The site uses one short `ease` for interaction (0.15s on buttons,
 * 0.18s on cards) and one long ambient loop (the hero icon's 6s float).
 * Keeping to those two registers is most of why it feels calm rather
 * than busy — resist adding a third.
 *
 * Every animation must gate on `useMotionEnabled()`. The site collapses
 * all motion to 0.001ms under `prefers-reduced-motion`; the RN equivalent
 * is to render the *final* state immediately, never a slower version of
 * the same movement.
 */
import { Easing, useReducedMotion } from 'react-native-reanimated';

export const motionDuration = {
  /** Press feedback — the site's 0.15s button transition. */
  press: 150,
  /** Content entering the screen — the site's 0.18s, rounded up for touch. */
  enter: 260,
  /** Chart reveal — the one place a slow, deliberate sweep reads as polish. */
  chart: 750,
} as const;

export const motionEasing = {
  /** CSS `ease`, which is what every transition on the site uses. */
  standard: Easing.bezier(0.25, 0.1, 0.25, 1),
  /** Decelerate-only, for elements entering the screen. */
  out: Easing.out(Easing.cubic),
} as const;

/** False when the OS "reduce motion" accessibility switch is on. */
export function useMotionEnabled(): boolean {
  return !useReducedMotion();
}
