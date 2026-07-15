/**
 * Project-wide `Button` wrapper that applies the app's theme overrides
 * to React Native Paper's `Button`.
 *
 * Why this wrapper exists
 * -----------------------
 * Paper's MD3 `Button` is a fully-rounded pill (`borderRadius: 1e3`)
 * and does NOT honor `theme.roundness`, so there is no theme-level
 * equivalent of MUI's `theme.components.MuiButton.styleOverrides.root`
 * to flatten the corner radius globally. Wrapping `Button` in one
 * place is the only way to keep "define once, use everywhere".
 *
 * Defaults applied
 * ----------------
 *   - `borderRadius: 12` — matches the calculator keypad cells, the
 *     outlined `TextInput`s, and the dialog's input fields, so all
 *     primary surfaces share the same rounded-rectangle vocabulary.
 *   - Uppercase label with `letterSpacing: 0.5` — matches the legacy
 *     Material 1 / web frontend look the user expects for actions.
 *   - `labelStyle.lineHeight === fontSize` — Paper's default label
 *     `lineHeight` sits taller than its glyph box, which makes the
 *     baseline-aligned text drift toward the top of the (now-flat)
 *     container. Pinning the line-height vertically re-centers it.
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

// MD3's button label size (`labelLarge` = 14sp), which also matches the web
// frontend's 14px (MUI) buttons. Keeping it at the spec size — rather than the
// oversized 16 — lets a dialog's two action buttons sit on one row at normal
// font sizes instead of wrapping. Scaled by the in-app font picker below.
const BASE_LABEL_SIZE = 14;
// Baseline vertical padding around the label (also what drives the button's
// height, since Paper's `Button` sizes to its label). Scaled with the screen
// so buttons grow a touch on big devices.
const BASE_LABEL_MARGIN = 12;

export type ThemedButtonProps = ButtonProps;

export function ThemedButton({ style, labelStyle, ...rest }: ThemedButtonProps) {
  // Honor Settings → Font size (like AppListItem does). Paper's `Button`
  // ignores the theme's scaled variants, so we size the label ourselves;
  // `lineHeight === fontSize` re-centers the text in the flat button.
  const { fontScale } = useFontScale();
  // No CSS media queries in RN: derive a gentle screen-size multiplier from the
  // window height so every button grows slightly on large / tall devices. 1.0
  // on a ~760dp-tall phone up to ~1.3 on big screens; never below 1.0. Kept
  // modest so two action buttons still share one row.
  const { height } = useWindowDimensions();
  const screenScale = Math.min(1.3, Math.max(1, height / 760));
  const size = Math.round(BASE_LABEL_SIZE * FONT_SCALES[fontScale] * screenScale);
  const labelMargin = Math.round(BASE_LABEL_MARGIN * screenScale);
  return (
    <Button
      {...rest}
      style={[styles.button, style] as StyleProp<ViewStyle>}
      labelStyle={
        [
          styles.label,
          { fontSize: size, lineHeight: size, marginVertical: labelMargin },
          labelStyle,
        ] as StyleProp<TextStyle>
      }
    />
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
  },
  label: {
    marginVertical: BASE_LABEL_MARGIN,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
