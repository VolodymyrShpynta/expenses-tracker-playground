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

export interface HeaderTileProps {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly onPress: () => void;
}

export function HeaderTile({ label, value, color, onPress }: HeaderTileProps) {
  const fg = contrastTextColor(color);
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
        minHeight: 84,
      }}
    >
      <View
        style={{
          padding: 16,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: fg, opacity: 0.85, fontSize: 12, marginBottom: 4 }}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: fg, fontWeight: '600', fontSize: 18, lineHeight: 22 }}
        >
          {value}
        </Text>
      </View>
    </TouchableRipple>
  );
}
