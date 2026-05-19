/**
 * Overview screen — Grafana-style time-series view of expenses by
 * category for the active period (preset + range from the header).
 *
 * Layout (top → bottom inside a `ScrollView`):
 *   1. `SpendingHeader` — period picker + grand total (shared widget).
 *   2. `SparklineChart` — 48 px overall-total trend with title/dates.
 *   3. Mode toggle — `SegmentedButtons` switching between separate
 *      lines and a stacked area.
 *   4. `ExpenseTimeSeriesChart` — main 240 px chart with axes, grid,
 *      and a drag-scrub tooltip.
 *   5. `OverviewCategoryFilter` — empty-state filter icon (right
 *      aligned) or chip-row include filter. Sits **below** the chart
 *      so the chips don't push it off-screen on small phones — the
 *      chart is the primary content, the filter modifies what it shows.
 *   6. `CategoryBreakdownList` — per-line legend with progress bar +
 *      percentage + amount; matches the Home tab's category breakdown.
 *   7. Optional approx-rates caveat when at least one converted amount
 *      uses the live fallback rate (matches the `~` convention used
 *      everywhere else in the app).
 *
 * All data derivations + include-filter state live in
 * `useOverviewModel`. The only state kept locally is `mode` — it
 * affects rendering, not data, so it doesn't belong in the model.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { CategoryBreakdownList } from '../../src/components/CategoryBreakdownList';
import { ExpenseTimeSeriesChart } from '../../src/components/ExpenseTimeSeriesChart';
import { OverviewCategoryFilter } from '../../src/components/OverviewCategoryFilter';
import { SparklineChart } from '../../src/components/SparklineChart';
import { SpendingHeader } from '../../src/components/SpendingHeader';
import { useOverviewModel } from '../../src/hooks/useOverviewModel';

type ChartMode = 'lines' | 'stacked-area';

export default function OverviewScreen() {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const {
    loading,
    mainCurrency,
    granularity,
    categorySeries,
    totalSeries,
    availableCategoryIds,
    selectedCategoryIds,
    handleAddInclude,
    handleRemoveInclude,
    resolveSeries,
    resolveSeriesName,
    resolveSeriesColor,
  } = useOverviewModel();

  const [mode, setMode] = useState<ChartMode>('lines');

  // Tapping a breakdown row drills into the Transactions screen
  // pre-filtered to the chosen category — mirrors the Categories tab.
  const handleCategoryPress = useCallback(
    (categoryId: string) => {
      router.push({
        pathname: '/(tabs)/transactions',
        params: { categoryId },
      });
    },
    [router],
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SpendingHeader
          total={{ amount: totalSeries.total, approx: totalSeries.approx }}
          currency={mainCurrency}
        />

        <View style={styles.sparklineWrapper}>
          <SparklineChart
            points={totalSeries.points}
            buckets={totalSeries.buckets}
            granularity={granularity}
            language={i18n.language}
            color={theme.colors.primary}
            title={translate('expenses.totalSpending')}
            totalLabel={translate('expenses.overviewTooltipTotal')}
            accessibilityLabel={translate('expenses.overviewTotalSparklineLabel')}
          />
        </View>

        <View style={styles.modeWrapper}>
          <SegmentedButtons
            value={mode}
            onValueChange={(v) => setMode(v as ChartMode)}
            buttons={[
              {
                value: 'lines',
                label: translate('expenses.overviewModeLines'),
                icon: 'chart-line',
              },
              {
                value: 'stacked-area',
                label: translate('expenses.overviewModeStackedArea'),
                icon: 'chart-areaspline',
              },
            ]}
            density="small"
          />
        </View>

        <View style={styles.chartWrapper}>
          <ExpenseTimeSeriesChart
            buckets={categorySeries.buckets}
            series={categorySeries.series}
            mode={mode}
            granularity={granularity}
            resolveSeriesName={resolveSeriesName}
            resolveSeriesColor={resolveSeriesColor}
            totalLabel={translate('expenses.overviewTooltipTotal')}
            overflowLabel={translate('expenses.overviewTooltipOverflow')}
            language={i18n.language}
            noDataLabel={translate('expenses.overviewNoData')}
            accessibilityLabel={translate('expenses.overviewChartLabel')}
          />
        </View>

        <View style={styles.filterWrapper}>
          <OverviewCategoryFilter
            selectedCategoryIds={selectedCategoryIds}
            availableCategoryIds={availableCategoryIds}
            onAddInclude={handleAddInclude}
            onRemoveInclude={handleRemoveInclude}
          />
        </View>

        <CategoryBreakdownList
          series={categorySeries.series}
          resolveSeries={resolveSeries}
          mainCurrency={mainCurrency}
          language={i18n.language}
          onCategoryPress={handleCategoryPress}
        />

        {totalSeries.approx ? (
          <View style={styles.caveatWrapper}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {translate('expenses.overviewApproxRatesCaveat')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 32 },
  sparklineWrapper: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  modeWrapper: { paddingHorizontal: 16, paddingBottom: 8 },
  chartWrapper: { paddingHorizontal: 8 },
  filterWrapper: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  caveatWrapper: { paddingHorizontal: 16, paddingTop: 12 },
});
