/**
 * Bottom tab bar geometry, shared between the navigator that draws the bar
 * (`app/(tabs)/_layout.tsx`) and any surface that must reserve room for it
 * (e.g. `AppDialog` lifting a dialog clear of the bar). Centralised so the
 * height and label sizing can't drift between the two call sites.
 */
import { FONT_SCALES, type FontScaleKey } from '../context/preferencesProvider';

// React Navigation's default bottom-tab height (UIKit variant) is sized for
// its default 10px label. Our label is `12 × fontScale`, so we grow the bar
// by 2px per extra px of label height to keep the label clear of the system
// nav bar even before the OS / in-app font scaling is applied.
const TAB_BAR_BASE_HEIGHT = 49;
const REACT_NAVIGATION_DEFAULT_LABEL_SIZE = 10;
const TAB_LABEL_BASE_SIZE = 12;

/** Tab-bar label font size for the given font-scale preference. */
export function tabBarLabelFontSize(fontScale: FontScaleKey): number {
  return Math.round(TAB_LABEL_BASE_SIZE * FONT_SCALES[fontScale]);
}

/**
 * Height of the tab bar's body (icons + labels) EXCLUDING the OS safe-area
 * inset. Callers add `insets.bottom` for the full on-screen bar height.
 */
export function tabBarBodyHeight(fontScale: FontScaleKey): number {
  const labelOverhead = Math.max(
    0,
    tabBarLabelFontSize(fontScale) - REACT_NAVIGATION_DEFAULT_LABEL_SIZE,
  );
  return TAB_BAR_BASE_HEIGHT + labelOverhead * 2;
}
