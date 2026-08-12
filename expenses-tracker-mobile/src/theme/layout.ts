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
import { StyleSheet } from 'react-native';

/** Widest a screen's scrollable content column may get. */
export const MAX_CONTENT_WIDTH = 1100;

/** Widest an `AppDialog` may get (Material's large-screen dialog cap). */
export const MAX_DIALOG_WIDTH = 560;

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
