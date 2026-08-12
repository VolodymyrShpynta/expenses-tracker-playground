/**
 * One category's share of the period, as a card row.
 *
 * A card per row rather than a flat list: the categories screen is a
 * ranking, and giving each entry its own elevated surface — the site's
 * `.feature` treatment — makes the ordering legible at a glance instead
 * of reading as one undifferentiated block.
 *
 * Its own component (not inlined in the screen) so `memo` can keep a row
 * from re-rendering while a sibling changes, and so the entrance stagger
 * has somewhere to live.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useAppColors } from '../theme/appColors';
import { motionDuration, useMotionEnabled } from '../theme/motion';
import { radius } from '../theme/tokens';
import { interFont } from '../theme/typography';
import type { MaterialIconName } from '../utils/categoryConfig';
import { lighten } from '../utils/colorContrast';
import { formatTotalCompactWithCurrency } from '../utils/format';
import { AppCard } from './AppCard';
import { CategoryAvatar } from './CategoryAvatar';

/** Rows past this point enter together — a longer cascade reads as lag. */
const MAX_STAGGERED_ROWS = 8;
const STAGGER_STEP_MS = 45;

export interface CategoryRowProps {
  readonly categoryId: string;
  readonly name: string;
  readonly color: string;
  readonly iconName: MaterialIconName;
  readonly percentage: number;
  readonly amount: number;
  readonly approx: boolean;
  readonly currency: string;
  readonly language: string;
  /** Rank in the list — drives the entrance stagger only. */
  readonly index: number;
  /** Takes the id so the screen can pass one stable callback for every row. */
  readonly onPress: (categoryId: string) => void;
}

export const CategoryRow = memo(function CategoryRow({
  categoryId,
  name,
  color,
  iconName,
  percentage,
  amount,
  approx,
  currency,
  language,
  index,
  onPress,
}: CategoryRowProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const percent = Math.round(percentage);

  const entering = motionEnabled
    ? {
        entering: FadeInDown.duration(motionDuration.enter).delay(
          Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS,
        ),
      }
    : {};

  return (
    <Animated.View {...entering} style={styles.wrapper}>
      <AppCard onPress={() => onPress(categoryId)} accessibilityLabel={name}>
        <View style={styles.body}>
          <CategoryAvatar iconName={iconName} color={color} />

          <View style={styles.text}>
            <View style={styles.titleRow}>
              <Text
                variant="bodyLarge"
                numberOfLines={1}
                style={[styles.name, { color: theme.colors.onSurface }]}
              >
                {name}
              </Text>
              <Text style={[styles.percent, { color: appColors.textDim }]}>{percent}%</Text>
            </View>

            <View style={[styles.track, { backgroundColor: appColors.progressTrackBg }]}>
              <LinearGradient
                colors={[color, lighten(color, 0.35)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.fill, { width: `${Math.max(percent, 2)}%` }]}
              />
            </View>
          </View>

          <View style={styles.amountColumn}>
            <Text numberOfLines={1} style={[styles.amount, { color: theme.colors.onSurface }]}>
              {formatTotalCompactWithCurrency(amount, currency, language, approx)}
            </Text>
          </View>

          <MaterialIcons name="chevron-right" size={20} color={appColors.textDim} />
        </View>
      </AppCard>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: 14, marginTop: 10 },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  text: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: { fontFamily: interFont.semiBold, flex: 1, marginRight: 8 },
  percent: { fontFamily: interFont.medium, fontSize: 13 },
  track: {
    marginTop: 8,
    height: 6,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.xs },
  // Fixed column that never shrinks: the name yields instead, and
  // `numberOfLines` stops a space-separated amount ("CZK 1 682,90") from
  // breaking after the currency code.
  amountColumn: { minWidth: 78, flexShrink: 0 },
  amount: { fontFamily: interFont.bold, fontSize: 15, textAlign: 'right' },
});
