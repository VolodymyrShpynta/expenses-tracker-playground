/**
 * HeaderTile — colored, tappable summary tile used in the
 * `AddExpenseDialog` header (date / category).
 *
 * Picks a contrasting foreground color automatically so that whatever
 * accent color is passed in (theme primary, category color, …) reads
 * legibly against it.
 */
import { View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { contrastTextColor } from '../utils/colorContrast';
import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';

const BASE_LABEL_SIZE = 12;
const BASE_VALUE_SIZE = 18;
const BASE_MIN_HEIGHT = 72;
const BASE_PADDING = 12;

export interface HeaderTileProps {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly onPress: () => void;
  /** Screen-size responsive multiplier applied on top of the user's font
   *  preference so the tile (height, padding, text) grows on larger
   *  devices. Defaults to 1 (no change on regular phones). */
  readonly sizeScale?: number;
}

export function HeaderTile({ label, value, color, onPress, sizeScale = 1 }: HeaderTileProps) {
  const fg = contrastTextColor(color);
  // Honor Settings → Font size; the tile's `minHeight` is a floor, so it
  // grows to fit the scaled label + value. The value is truncated to a single
  // line (…) rather than wrapped, keeping both tiles the same compact height.
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale] * sizeScale;
  return (
    <TouchableRipple
      onPress={onPress}
      borderless
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        borderRadius: 12,
        backgroundColor: color,
        minHeight: Math.round(BASE_MIN_HEIGHT * sizeScale),
      }}
    >
      <View
        style={{
          padding: Math.round(BASE_PADDING * sizeScale),
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: fg,
            opacity: 0.85,
            fontSize: Math.round(BASE_LABEL_SIZE * scale),
            marginBottom: Math.round(4 * sizeScale),
          }}
        >
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: fg,
            fontWeight: '600',
            fontSize: Math.round(BASE_VALUE_SIZE * scale),
          }}
        >
          {value}
        </Text>
      </View>
    </TouchableRipple>
  );
}
