/**
 * Floating action button in the site's gradient-and-glow language.
 *
 * Circular, a 135° indigo gradient fill and the indigo glow shadow that gives
 * the landing page's CTA its lift. The site lifts on hover; touch has no
 * hover, so the press state dips and tightens the glow instead.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppColors } from '../theme/appColors';
import { motionDuration, motionEasing, useMotionEnabled } from '../theme/motion';
import { radius } from '../theme/tokens';

export interface GlowFabProps {
  readonly icon: ReactNode;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function GlowFab({ icon, onPress, accessibilityLabel, style }: GlowFabProps) {
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const pressed = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.06 }],
  }));

  const setPressed = (value: number) => {
    if (!motionEnabled) return;
    pressed.value = withTiming(value, {
      duration: motionDuration.press,
      easing: motionEasing.standard,
    });
  };

  return (
    <Animated.View
      style={[styles.shell, { boxShadow: appColors.brandGlowStrong }, pressStyle, style]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(1)}
        onPressOut={() => setPressed(0)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <LinearGradient
          colors={appColors.brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.body}
        >
          {icon}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const FAB_SIZE = 60;

const styles = StyleSheet.create({
  // The shadow lives on the outer shell: the `overflow: hidden` that clips the
  // gradient to the circle would otherwise clip the glow too.
  shell: {
    borderRadius: radius.pill,
  },
  body: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
