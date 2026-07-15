/**
 * Per-line breakdown list for the Overview chart — matches the visual
 * style of the Home tab's category breakdown rows:
 *
 *   [avatar]  Name           28%   CZK 105,383
 *             ████████░░░░░░░
 *
 * Each row reflects one series currently shown in the chart (category
 * or the synthetic `__other` rollup). When `onCategoryPress` is
 * provided, real category rows become tappable (and navigate to the
 * Transactions tab filtered by that category, mirroring the Categories
 * screen); the synthetic `__other` rollup stays non-interactive since
 * it has no single backing category id.
 *
 * Percentages are computed against the sum of `series[i].total` so the
 * visible breakdown sums to 100 %, even when an include filter has
 * narrowed the chart to a subset of categories. We deliberately don't
 * use the screen-level grand total here: a filtered view that sums to
 * (say) 47 % is more confusing than a closed 100 %.
 */
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import { CategoryAvatar } from './CategoryAvatar';
import type { MaterialIconName } from '../utils/categoryConfig';
import type { ChartSeries } from '../domain/timeSeries';
import { OTHER_SERIES_ID } from '../domain/timeSeries';
import type { ConvertedAmount } from '../domain/exchangeRates';
import { formatTotalCompactWithCurrency } from '../utils/format';
import { useAppColors } from '../theme/appColors';

export interface BreakdownSeriesResolution {
  readonly name: string;
  readonly color: string;
  readonly iconName: MaterialIconName;
}

export interface CategoryBreakdownListProps {
  readonly series: ReadonlyArray<ChartSeries>;
  readonly resolveSeries: (id: string) => BreakdownSeriesResolution;
  readonly mainCurrency: string;
  readonly language: string;
  readonly onCategoryPress?: (categoryId: string) => void;
  readonly style?: StyleProp<ViewStyle>;
}

export const CategoryBreakdownList = memo(function CategoryBreakdownList({
  series,
  resolveSeries,
  mainCurrency,
  language,
  onCategoryPress,
  style,
}: CategoryBreakdownListProps) {
  const theme = useTheme();
  const appColors = useAppColors();

  const totalSum = useMemo(
    () => series.reduce((sum, s) => sum + s.total, 0),
    [series],
  );

  if (series.length === 0) return null;

  return (
    <View style={style}>
      {series.map((s) => {
        const resolved = resolveSeries(s.categoryId);
        const amount: ConvertedAmount = { amount: s.total, approx: s.approx };
        const pct = totalSum > 0 ? Math.round((s.total / totalSum) * 100) : 0;
        const accessibilityLabel = `${resolved.name} ${pct}% ${formatTotalCompactWithCurrency(
          amount.amount,
          mainCurrency,
          language,
          amount.approx,
        )}`;
        // The `__other` rollup represents many categories — there's no
        // single category to drill into, so keep it non-interactive even
        // when `onCategoryPress` is provided.
        const isInteractive =
          onCategoryPress !== undefined && s.categoryId !== OTHER_SERIES_ID;
        const row = (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 16,
            }}
          >
            <CategoryAvatar iconName={resolved.iconName} color={resolved.color} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Text
                  variant="bodyLarge"
                  style={{ fontWeight: '500', color: theme.colors.onSurface, flex: 1, marginRight: 8 }}
                  numberOfLines={1}
                >
                  {resolved.name}
                </Text>
                <Text
                  variant="labelMedium"
                  style={{ color: resolved.color, fontWeight: '700' }}
                >
                  {pct}%
                </Text>
              </View>
              <View
                style={{
                  marginTop: 4,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: appColors.progressTrackBg,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    backgroundColor: resolved.color,
                    borderRadius: 3,
                  }}
                />
              </View>
            </View>
            <Text
              variant="bodyLarge"
              style={{
                color: resolved.color,
                fontWeight: '700',
                minWidth: 80,
                textAlign: 'right',
              }}
            >
              {formatTotalCompactWithCurrency(amount.amount, mainCurrency, language, amount.approx)}
            </Text>
          </View>
        );
        if (isInteractive) {
          return (
            <TouchableRipple
              key={s.categoryId}
              onPress={() => onCategoryPress(s.categoryId)}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
            >
              {row}
            </TouchableRipple>
          );
        }
        return (
          <View
            key={s.categoryId}
            accessibilityRole="text"
            accessibilityLabel={accessibilityLabel}
          >
            {row}
          </View>
        );
      })}
    </View>
  );
});

export { OTHER_SERIES_ID };
