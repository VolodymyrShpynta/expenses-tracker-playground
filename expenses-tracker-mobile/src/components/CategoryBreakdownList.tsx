/**
 * Per-line breakdown list for the Overview chart. Rows are `CategoryStatRow`,
 * shared with the Categories screen, so the same category reads the same way
 * on both tabs — flat here rather than carded, since full cards under the
 * charts would double this panel's weight:
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
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { CategoryRow } from './CategoryRow';
import type { MaterialIconName } from '../utils/categoryConfig';
import type { ChartSeries } from '../domain/timeSeries';
import { OTHER_SERIES_ID } from '../domain/timeSeries';
import { formatTotalCompactWithCurrency } from '../utils/format';

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
  const totalSum = useMemo(
    () => series.reduce((sum, s) => sum + s.total, 0),
    [series],
  );

  if (series.length === 0) return null;

  return (
    <View style={[styles.list, style]}>
      {series.map((s) => {
        const resolved = resolveSeries(s.categoryId);
        const pct = totalSum > 0 ? (s.total / totalSum) * 100 : 0;
        // The `__other` rollup represents many categories — there's no
        // single category to drill into, so keep it non-interactive even
        // when `onCategoryPress` is provided.
        const isInteractive =
          onCategoryPress !== undefined && s.categoryId !== OTHER_SERIES_ID;
        return (
          <CategoryRow
            key={s.categoryId}
            categoryId={s.categoryId}
            name={resolved.name}
            color={resolved.color}
            iconName={resolved.iconName}
            percentage={pct}
            amount={s.total}
            approx={s.approx}
            currency={mainCurrency}
            language={language}
            accessibilityLabel={`${resolved.name} ${Math.round(
              pct,
            )}% ${formatTotalCompactWithCurrency(s.total, mainCurrency, language, s.approx)}`}
            {...(isInteractive ? { onPress: onCategoryPress } : {})}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { paddingHorizontal: 14 },
});

export { OTHER_SERIES_ID };
