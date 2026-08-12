/**
 * Empty state — headline and a supporting line.
 *
 * Deliberately text-only: every screen that uses it already carries a FAB, so
 * a call to action here is a second button for the same job, and the copy
 * points at the FAB anyway.
 */
import { StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useAppColors } from '../theme/appColors';
import { motionDuration, useMotionEnabled } from '../theme/motion';
import { interFont } from '../theme/typography';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const entering = motionEnabled
    ? { entering: FadeInDown.duration(motionDuration.enter) }
    : {};

  return (
    <Animated.View {...entering} style={styles.root}>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: appColors.textDim }]}>{description}</Text>
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
  title: {
    fontFamily: interFont.semiBold,
    fontSize: 20,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  description: {
    fontFamily: interFont.regular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
});
