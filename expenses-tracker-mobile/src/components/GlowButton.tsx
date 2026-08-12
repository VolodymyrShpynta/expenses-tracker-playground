/**
 * Primary action button — the site's `.btn-primary`.
 *
 * Pill radius, a 135° indigo gradient fill, and the indigo glow shadow
 * (`0 12px 24px rgba(99,102,241,.35)`) that gives the landing page's CTA
 * its lift. The site lifts on hover; touch has no hover, so the press
 * state dips and tightens the glow instead.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';
import { useAppColors } from '../theme/appColors';
import { motionDuration, motionEasing, useMotionEnabled } from '../theme/motion';
import { radius } from '../theme/tokens';
import { interFont } from '../theme/typography';

/** The site's `.btn-primary` font size. */
const BASE_LABEL_SIZE = 16;

export interface GlowButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export function GlowButton({ label, onPress, icon, disabled, style }: GlowButtonProps) {
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const { fontScale } = useFontScale();
  const pressed = useSharedValue(0);
  const labelSize = Math.round(BASE_LABEL_SIZE * FONT_SCALES[fontScale]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
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
      style={[
        pressStyle,
        styles.shell,
        { boxShadow: appColors.brandGlow },
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(1)}
        onPressOut={() => setPressed(0)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <LinearGradient
          colors={appColors.brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.body}
        >
          {icon}
          <Text style={[styles.label, { fontSize: labelSize }]} numberOfLines={1}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The shadow lives on the outer shell: an `overflow: hidden` needed to
  // clip the gradient to the pill would otherwise clip the glow too.
  shell: {
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  label: {
    color: '#ffffff',
    fontFamily: interFont.semiBold,
  },
  disabled: {
    opacity: 0.5,
  },
});

/** Circular floating action button in the same gradient-and-glow language. */
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
      style={[fabStyles.shell, { boxShadow: appColors.brandGlowStrong }, pressStyle, style]}
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
          style={fabStyles.body}
        >
          {icon}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const FAB_SIZE = 60;

const fabStyles = StyleSheet.create({
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

/**
 * Small uppercase pill that labels a section — the site's `.eyebrow`
 * ("WHY SPENDIUM"): 13px, weight 600, `0.08em` tracking, brand-50 fill.
 */
export interface EyebrowProps {
  readonly children: string;
  readonly style?: StyleProp<ViewStyle>;
}

const EYEBROW_SIZE = 13;

export function Eyebrow({ children, style }: EyebrowProps) {
  const appColors = useAppColors();
  const { fontScale } = useFontScale();
  const size = Math.round(EYEBROW_SIZE * FONT_SCALES[fontScale]);
  return (
    <View style={[eyebrowStyles.pill, { backgroundColor: appColors.eyebrowBg }, style]}>
      <Text
        numberOfLines={1}
        style={{
          color: appColors.eyebrowText,
          fontFamily: interFont.semiBold,
          fontSize: size,
          letterSpacing: size * 0.08,
        }}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}

const eyebrowStyles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
});
