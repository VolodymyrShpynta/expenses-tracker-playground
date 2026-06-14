/**
 * Project-wide `<List.Item>` wrapper that respects the user's font-size
 * preference.
 *
 * Why this wrapper exists
 * -----------------------
 * Paper v5's `List.Item` hardcodes `fontSize: 16` (title) and
 * `fontSize: 14` (description) in its internal `styles` object and
 * applies them *after* the caller's `titleStyle` / `descriptionStyle`,
 * so the scaled values produced by `scaleTheme()` never reach the
 * rendered `<Text>`. The Settings list (and any other `<List.Item>`
 * surface) therefore ignored Settings → Font size entirely.
 *
 * This wrapper reads `useFontScale()` and forwards `titleStyle` /
 * `descriptionStyle` with the right `fontSize`. Caller-supplied styles
 * still merge on top, so explicit overrides keep working.
 */
import { List } from 'react-native-paper';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import type { ComponentProps } from 'react';

import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';

const BASE_TITLE_SIZE = 16;
const BASE_DESCRIPTION_SIZE = 14;

export type AppListItemProps = ComponentProps<typeof List.Item>;

export function AppListItem({ titleStyle, descriptionStyle, ...rest }: AppListItemProps) {
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];

  const scaledTitleStyle: StyleProp<TextStyle> = StyleSheet.flatten([
    { fontSize: Math.round(BASE_TITLE_SIZE * scale) },
    titleStyle,
  ]);
  const scaledDescriptionStyle: StyleProp<TextStyle> = StyleSheet.flatten([
    { fontSize: Math.round(BASE_DESCRIPTION_SIZE * scale) },
    descriptionStyle,
  ]);

  return (
    <List.Item
      {...rest}
      titleStyle={scaledTitleStyle}
      descriptionStyle={scaledDescriptionStyle}
    />
  );
}
