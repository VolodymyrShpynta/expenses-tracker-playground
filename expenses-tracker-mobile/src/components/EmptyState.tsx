/**
 * Illustrated empty state — gradient medallion, headline, supporting line
 * and a primary action.
 *
 * An empty screen is the first thing a new user sees, so it carries the
 * call to action rather than leaving them to find the FAB. The medallion
 * borrows the site's hero-icon treatment: a gradient tile under an
 * oversized glyph, lifted by the indigo halo.
 */
import { StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useAppColors } from '../theme/appColors';
import { motionDuration, useMotionEnabled } from '../theme/motion';
import { radius } from '../theme/tokens';
import { interFont } from '../theme/typography';
import { GlowButton } from './GlowButton';

const MEDALLION_SIZE = 92;

export interface EmptyStateProps {
  readonly icon: keyof typeof MaterialIcons.glyphMap;
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const entering = motionEnabled
    ? { entering: FadeInDown.duration(motionDuration.enter) }
    : {};

  return (
    <Animated.View {...entering} style={styles.root}>
      <LinearGradient
        colors={appColors.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.medallion, { boxShadow: appColors.brandHalo }]}
      >
        <MaterialIcons name={icon} size={40} color="#ffffff" />
      </LinearGradient>

      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: appColors.textDim }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <GlowButton
          label={actionLabel}
          onPress={onAction}
          icon={<MaterialIcons name="add" size={20} color="#ffffff" />}
          style={styles.action}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 32,
  },
  medallion: {
    width: MEDALLION_SIZE,
    height: MEDALLION_SIZE,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: interFont.extraBold,
    fontSize: 20,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  description: {
    fontFamily: interFont.regular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  action: {
    marginTop: 24,
    alignSelf: 'center',
  },
});
