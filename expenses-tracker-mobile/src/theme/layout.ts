/**
 * Width geometry for surfaces that would otherwise span the whole window.
 *
 * The app is no longer locked to portrait (`orientation: "default"` in
 * `app.json`), so on a tablet — or any phone in landscape — the window can be
 * two to three times wider than the phone layouts were designed for. Left
 * unbounded, a list row strands its avatar against the far-left edge and its
 * amount against the far-right one, and a dialog stretches edge to edge.
 * Capping the column keeps the phone layout byte-for-byte identical (the cap
 * is wider than any phone) while giving large screens a readable measure.
 */
import { StyleSheet, useWindowDimensions } from 'react-native';

/** Widest a screen's scrollable content column may get. */
export const MAX_CONTENT_WIDTH = 1100;

/** Widest an `AppDialog` may get (Material's large-screen dialog cap). */
export const MAX_DIALOG_WIDTH = 560;

/**
 * Material's "expanded" window class. Below this a side-by-side layout would
 * squeeze both panes past the point where either is readable.
 */
export const WIDE_LAYOUT_MIN_WIDTH = 840;

/**
 * Two panes need vertical room as well as horizontal. A phone in landscape
 * clears the width threshold but is only ~390dp tall — far too short for a
 * summary pane to stack a total, a period picker and a chart. Matches
 * Material's compact-height boundary.
 */
export const WIDE_LAYOUT_MIN_HEIGHT = 480;

/** Material's "medium" window class — a tablet in portrait starts here. */
export const MEDIUM_LAYOUT_MIN_WIDTH = 600;

/** Side margin Material asks for once the window leaves the compact class. */
const MEDIUM_WINDOW_GUTTER = 24;

/** True when the window can host two panes side by side. */
export function useIsWideLayout(): boolean {
  const { width, height } = useWindowDimensions();
  return width >= WIDE_LAYOUT_MIN_WIDTH && height >= WIDE_LAYOUT_MIN_HEIGHT;
}

/**
 * Horizontal breathing room for a screen's content column.
 *
 * Only the band between a phone and `MAX_CONTENT_WIDTH` needs it: narrower
 * than that and the screen is a phone (where full-bleed rows are correct),
 * wider and centring the capped column already leaves margins on both sides.
 */
export function useContentGutter(): number {
  const { width } = useWindowDimensions();
  const inMediumBand = width >= MEDIUM_LAYOUT_MIN_WIDTH && width < MAX_CONTENT_WIDTH;
  return inMediumBand ? MEDIUM_WINDOW_GUTTER : 0;
}

export const layoutStyles = StyleSheet.create({
  /**
   * Fill the window on phones, cap and centre on large screens. Also used by
   * the bottom sheets, which are content columns anchored to the bottom.
   */
  contentColumn: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
});
