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
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export type ThemedButtonProps = ButtonProps;

export function ThemedButton({ style, labelStyle, ...rest }: ThemedButtonProps) {
  return (
    <Button
      {...rest}
      style={[styles.button, style] as StyleProp<ViewStyle>}
      labelStyle={[styles.label, labelStyle] as StyleProp<TextStyle>}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
  },
  label: {
    fontSize: 14,
    lineHeight: 14,
    marginVertical: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
