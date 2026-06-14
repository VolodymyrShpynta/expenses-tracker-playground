/**
 * Project-wide `<RadioButton.Item>` wrapper that respects the user's
 * font-size preference.
 *
 * Why this wrapper exists
 * -----------------------
 * Paper v5's `RadioButton.Item` renders the label via
 * `<Text variant="bodyLarge">`, which *does* read from `theme.fonts`,
 * but the moment a caller supplies `labelStyle` the cascade can
 * unexpectedly mask the scaled value. To match the [AppListItem](./AppListItem.tsx)
 * pattern and give every picker dialog the same predictable scaling,
 * we apply an explicit `labelStyle.fontSize` driven by `useFontScale()`.
 *
 * Caller-supplied `labelStyle` still merges on top, so explicit
 * overrides keep working.
 */
import { RadioButton } from 'react-native-paper';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import type { ComponentProps } from 'react';

import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';

const BASE_LABEL_SIZE = 16;

export type AppRadioItemProps = ComponentProps<typeof RadioButton.Item>;

export function AppRadioItem({ labelStyle, ...rest }: AppRadioItemProps) {
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];

  const scaledLabelStyle: StyleProp<TextStyle> = StyleSheet.flatten([
    { fontSize: Math.round(BASE_LABEL_SIZE * scale) },
    labelStyle,
  ]);

  return <RadioButton.Item {...rest} labelStyle={scaledLabelStyle} />;
}
