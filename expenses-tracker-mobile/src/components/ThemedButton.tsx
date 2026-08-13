/**
 * Project-wide `Button` wrapper that applies the app's theme overrides
 * to React Native Paper's `Button`.
 *
 * Why this wrapper exists
 * -----------------------
 * Paper's MD3 `Button` hard-codes its shape and label typography rather
 * than reading them from the theme, so there is no theme-level
 * equivalent of MUI's `theme.components.MuiButton.styleOverrides.root`.
 * Wrapping `Button` in one place is the only way to keep "define once,
 * use everywhere".
 *
 * For the screen-level primary action prefer `GlowFab`, which carries the
 * site's gradient fill and indigo glow. This wrapper is the neutral
 * (text / outlined / tonal) counterpart.
 *
 * Defaults applied
 * ----------------
 *   - Pill radius — the landing site's `.btn-primary` / `.btn-ghost` shape.
 *   - Inter SemiBold in sentence case, matching the site's buttons.
 *   - A label line box sized to Inter's glyph box, so the text sits centered
 *     in the button without clipping ascenders or descenders.
 *
 * Caller-supplied `style` / `labelStyle` are merged on top of these
 * defaults, so individual call sites can still override anything.
 */
import { Button, type ButtonProps } from 'react-native-paper';
import {
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';
import { radius } from '../theme/tokens';
import { interFont } from '../theme/typography';

// MD3's button label size (`labelLarge` = 14sp), which also matches the web
// frontend's 14px (MUI) buttons. Keeping it at the spec size — rather than the
// oversized 16 — lets a dialog's two action buttons sit on one row at normal
// font sizes instead of wrapping. Scaled by the in-app font picker below.
const BASE_LABEL_SIZE = 14;
// Baseline vertical padding around the label (also what drives the button's
// height, since Paper's `Button` sizes to its label). Scaled with the screen
// so buttons grow a touch on big devices.
const BASE_LABEL_MARGIN = 12;
// Inter's ascender-to-descender box is ~1.21x the font size. A line height
// below that makes both platforms cut glyphs off — descenders such as the
// Cyrillic "у" or Latin "g" go missing — so keep a little headroom above it.
const LABEL_LINE_HEIGHT_RATIO = 1.25;

export type ThemedButtonProps = ButtonProps;

export function ThemedButton({ style, labelStyle, ...rest }: ThemedButtonProps) {
  // Honor Settings → Font size (like AppListItem does). Paper's `Button`
  // ignores the theme's scaled variants, so we size the label ourselves.
  const { fontScale } = useFontScale();
  // No CSS media queries in RN: derive a gentle screen-size multiplier from the
  // window height so every button grows slightly on large / tall devices. 1.0
  // on a ~760dp-tall phone up to ~1.3 on big screens; never below 1.0. Kept
  // modest so two action buttons still share one row.
  const { height } = useWindowDimensions();
  const screenScale = Math.min(1.3, Math.max(1, height / 760));
  const size = Math.round(BASE_LABEL_SIZE * FONT_SCALES[fontScale] * screenScale);
  const lineHeight = Math.ceil(size * LABEL_LINE_HEIGHT_RATIO);
  // Take the label's leading back out of the margin so the taller line box
  // does not make every button grow.
  const labelMargin = Math.max(
    4,
    Math.round(BASE_LABEL_MARGIN * screenScale - (lineHeight - size) / 2),
  );
  return (
    <Button
      {...rest}
      style={[styles.button, style] as StyleProp<ViewStyle>}
      labelStyle={
        [
          styles.label,
          { fontSize: size, lineHeight, marginVertical: labelMargin },
          labelStyle,
        ] as StyleProp<TextStyle>
      }
    />
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
  },
  label: {
    marginVertical: BASE_LABEL_MARGIN,
    fontFamily: interFont.semiBold,
    // Android otherwise pads the line box asymmetrically, which both shifts the
    // label off-center and eats into the room reserved for the glyphs.
    includeFontPadding: false,
  },
});
