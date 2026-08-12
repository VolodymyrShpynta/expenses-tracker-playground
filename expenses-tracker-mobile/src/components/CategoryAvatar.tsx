/**
 * Category tile — the primary visual marker for a category in lists, the
 * donut legend, and the add-expense sheet.
 *
 * A rounded square rather than a circle, matching the landing site's
 * `.feature-icon`: a 135° gradient tile with the glyph in the subject's
 * own colour. The gradient and its hairline are built from the category
 * colour at low alphas so the glyph stays legible in both themes.
 */
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

import { radius } from '../theme/tokens';
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

export function CategoryAvatar({ iconName, color, size = 44 }: CategoryAvatarProps) {
  const isDark = useTheme().dark;
  const iconSize = Math.round(size * 0.52);
  // Dark surfaces swallow low-alpha tints, so every stop lifts a step.
  const stops: readonly [string, string] = [
    withAlpha(color, isDark ? 0.3 : 0.2),
    withAlpha(color, isDark ? 0.12 : 0.07),
  ];

  return (
    <LinearGradient
      colors={stops}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, { width: size, height: size }]}
    >
      <View
        style={[styles.hairline, { borderColor: withAlpha(color, isDark ? 0.3 : 0.2) }]}
      />
      <MaterialIcons name={iconName} size={iconSize} color={color} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairline: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
