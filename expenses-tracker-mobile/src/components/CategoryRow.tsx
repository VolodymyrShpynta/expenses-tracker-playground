/**
 * One category's share of a period, as a card row: avatar, name,
 * percentage, progress bar and total.
 *
 * A card per row rather than a flat list: these lists are rankings, and
 * giving each entry its own elevated surface — the site's `.feature`
 * treatment — makes the ordering legible at a glance instead of reading as
 * one undifferentiated block. Used by both the Categories screen and the
 * Overview breakdown so the same category reads the same way on both tabs.
 *
 * Horizontal inset belongs to the list, not the row, because the two screens
 * wrap it in different containers.
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
const CHEVRON_SIZE = 20;

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
  /** Rank in the list — drives the entrance stagger. Omit for no entrance. */
  readonly index?: number;
  /** Defaults to the category name. */
  readonly accessibilityLabel?: string;
  /** Omit for a row with nothing to drill into (the Overview `__other`
   *  rollup); it then loses its chevron and press feedback. */
  readonly onPress?: (categoryId: string) => void;
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
  accessibilityLabel,
  onPress,
}: CategoryRowProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const percent = Math.round(percentage);

  const entering =
    motionEnabled && index !== undefined
      ? {
          entering: FadeInDown.duration(motionDuration.enter).delay(
            Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS,
          ),
        }
      : {};

  return (
    <Animated.View {...entering} style={styles.wrapper}>
      <AppCard
        accessibilityLabel={accessibilityLabel ?? name}
        {...(onPress ? { onPress: () => onPress(categoryId) } : {})}
      >
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

          {/* Slot is reserved either way, so a row with no chevron still lines
              its amount up with its neighbours. */}
          <View style={styles.chevronSlot}>
            {onPress ? (
              <MaterialIcons
                name="chevron-right"
                size={CHEVRON_SIZE}
                color={appColors.textDim}
              />
            ) : null}
          </View>
        </View>
      </AppCard>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: { marginTop: 10 },
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
  chevronSlot: { width: CHEVRON_SIZE },
});
