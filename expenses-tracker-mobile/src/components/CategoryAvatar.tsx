/**
 * Round colored avatar with a category icon — the primary visual marker
 * for a category in lists, the donut legend, and the add-expense sheet.
 *
 * Background uses the category color at a lowered opacity so the icon
 * stays legible in both light and dark themes (matches the web frontend's
 * `alpha(color, 0.15/0.25)` treatment).
 */
import { View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

import type { MaterialIconName } from '../utils/categoryConfig';

export interface CategoryAvatarProps {
  readonly iconName: MaterialIconName;
  readonly color: string;
  readonly size?: number;
}

/** Hex color + alpha (0-1) → rgba string. Defensive on malformed input. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const value = parseInt(m[1]!, 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function CategoryAvatar({ iconName, color, size = 40 }: CategoryAvatarProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const bg = withAlpha(color, isDark ? 0.25 : 0.15);
  const iconSize = Math.round(size * 0.55);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialIcons name={iconName} size={iconSize} color={color} />
    </View>
  );
}
