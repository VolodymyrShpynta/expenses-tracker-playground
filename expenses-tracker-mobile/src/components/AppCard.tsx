/**
 * Elevated card surface — the site's `.feature` card.
 *
 * `--bg-elev` fill, a hairline `--border`, `--radius-lg` (22) corners and
 * `--shadow-sm`. Pressable variants dip slightly instead of the site's
 * hover lift, which has no touch equivalent.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppColors } from '../theme/appColors';
import { motionDuration, motionEasing, useMotionEnabled } from '../theme/motion';
import { radius } from '../theme/tokens';

export interface AppCardProps {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function AppCard({ children, onPress, accessibilityLabel, style }: AppCardProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const pressed = useSharedValue(0);

  const surface: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderColor: appColors.border,
    boxShadow: appColors.shadowSm,
  };

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
  }));

  if (!onPress) {
    return <View style={[styles.card, surface, style]}>{children}</View>;
  }

  const setPressed = (value: number) => {
    if (!motionEnabled) return;
    pressed.value = withTiming(value, {
      duration: motionDuration.press,
      easing: motionEasing.standard,
    });
  };

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(1)}
        onPressOut={() => setPressed(0)}
        accessibilityRole="button"
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
        style={({ pressed: isPressed }) => [
          styles.card,
          surface,
          isPressed ? { borderColor: appColors.borderStrong } : null,
          style,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
