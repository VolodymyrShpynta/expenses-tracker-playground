/**
 * Project-wide outlined `TextInput` — the input counterpart to
 * `ThemedButton`, and it exists for the same reason.
 *
 * Paper takes the outline's shape from `theme.roundness` and its colour
 * from `theme.colors.outline`, neither of which matches this app: the
 * result is a square, heavier-bordered control on screens made of pills
 * and soft-bordered cards. There's no theme-level override for either, so
 * a wrapper is the only "define once, use everywhere" option.
 *
 * Inputs rendered inside a `Portal` must go through
 * `PortalSafeTextInput` — which renders this — rather than using it
 * directly. See that file for the cursor-jump bug it works around.
 */
import type { ComponentProps } from 'react';
import { TextInput, useTheme } from 'react-native-paper';

import { useAppColors } from '../theme/appColors';
import { radius } from '../theme/tokens';

export interface AppTextInputProps extends ComponentProps<typeof TextInput> {
  /**
   * `search` is a pill, by the platform convention for search bars.
   * `field` — the default — takes the card radius, so a form input sits in
   * the same family as the surfaces and tiles around it rather than reading
   * as a stray chip.
   */
  readonly shape?: 'field' | 'search';
}

export function AppTextInput({
  shape = 'field',
  style,
  outlineStyle,
  ...rest
}: AppTextInputProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  // A floating label notches the outline, and the notch tears visibly
  // against a pill, so a labelled input never takes the search shape.
  const pill = shape === 'search' && rest.label === undefined;
  return (
    <TextInput
      mode="outlined"
      outlineColor={appColors.border}
      outlineStyle={[{ borderRadius: pill ? radius.pill : radius.md }, outlineStyle]}
      style={[{ backgroundColor: theme.colors.surface }, style]}
      {...rest}
    />
  );
}
