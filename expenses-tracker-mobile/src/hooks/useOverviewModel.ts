/**
 * Overview screen model — all data derivations + include-filter state
 * for the Overview tab.
 *
 * Encapsulates:
 *   - Read-side hook composition (`useExpenses`, FX conversion,
 *     category lookup, period preference).
 *   - Bucket aggregation (`computeCategorySeries` / `computeTotalSeries`).
 *   - Include-filter state (`selectedCategoryIds`) + memoised set for
 *     downstream O(1) membership checks.
 *   - The picker's available-category set (categories in range minus
 *     already-selected).
 *   - Series resolution (id → name/color/icon) used by both the chart
 *     and the breakdown list, so the two stay in visual lockstep.
 *
 * The screen file is left with layout + the screen-local chart-mode
 * toggle. Date strings are parsed exactly once per `convertedExpenses`
 * change (`indexedCategories` memo) so toggling the filter doesn't
 * re-parse them.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import type { BreakdownSeriesResolution } from '../components/CategoryBreakdownList';
import { useDateRange, useMainCurrency } from '../context/preferencesProvider';
import {
  computeCategorySeries,
  computeTotalSeries,
  OTHER_SERIES_ID,
} from '../domain/timeSeries';
import { presetToGroupBy } from '../utils/dateRange';
import { useCategoryLookup } from './useCategoryLookup';
import { useConvertedExpenses } from './useExchangeRates';
import { useExpenses } from './useExpenses';

export function useOverviewModel() {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const { expenses, loading } = useExpenses();
  const { dateRange, preset } = useDateRange();
  const { mainCurrency } = useMainCurrency();
  const lookup = useCategoryLookup();
  const convertedExpenses = useConvertedExpenses(expenses);

  const granularity = useMemo(
    () => presetToGroupBy(preset, dateRange),
    [preset, dateRange],
  );

  // Include filter: empty array = no filter (show everything). When
  // populated, the chart is restricted to these category ids exactly —
  // no Top-N grouping, no `__other` rollup. Mirrors the Transactions
  // screen's include-only semantics.
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  // O(1) membership for downstream filtering loops.
  const selectedSet = useMemo(
    () => new Set(selectedCategoryIds),
    [selectedCategoryIds],
  );

  // Pre-compute `(categoryId, timestamp)` once per expense-list change.
  // Reused by `availableCategoryIds` so toggling the filter doesn't
  // re-parse `Date` strings for the whole expense list.
  const indexedCategories = useMemo(() => {
    const out: Array<{ categoryId: string; timestamp: number }> = [];
    for (const e of convertedExpenses) {
      if (!e.date || !e.categoryId) continue;
      out.push({
        categoryId: e.categoryId,
        timestamp: new Date(e.date).getTime(),
      });
    }
    return out;
  }, [convertedExpenses]);

  // Pre-filter the expense list when an include filter is active. The
  // domain aggregator then naturally produces at most `selectedCount`
  // series (no Top-N rollup) — saving one render pass and keeping the
  // breakdown in lockstep with the chart.
  const expensesForChart = useMemo(() => {
    if (selectedSet.size === 0) return convertedExpenses;
    return convertedExpenses.filter(
      (e) => e.categoryId !== undefined && selectedSet.has(e.categoryId),
    );
  }, [convertedExpenses, selectedSet]);

  // Domain functions do their own bucketing / range-filtering /
  // NOW-clamping. `Infinity` for `topN` surfaces every category in the
  // chart and breakdown list (no synthetic `__other` rollup) — matches
  // the Categories tab convention.
  const categorySeries = useMemo(
    () =>
      computeCategorySeries(
        expensesForChart,
        dateRange,
        granularity,
        Number.POSITIVE_INFINITY,
      ),
    [expensesForChart, dateRange, granularity],
  );

  // Sparkline ignores the include filter — it represents the **overall**
  // spending trend for the period, not just the selected slice, so the
  // header stays a stable reference point as the user toggles filters.
  const totalSeries = useMemo(
    () => computeTotalSeries(convertedExpenses, dateRange, granularity),
    [convertedExpenses, dateRange, granularity],
  );

  // Categories the picker can offer: any category present in the full
  // converted list within the active range, minus the ones already
  // selected. Reuses `indexedCategories` so we don't re-parse dates.
  const availableCategoryIds = useMemo(() => {
    const fromMs = dateRange.from.getTime();
    const toMs = dateRange.to.getTime();
    const set = new Set<string>();
    for (const item of indexedCategories) {
      if (selectedSet.has(item.categoryId)) continue;
      if (item.timestamp < fromMs || item.timestamp > toMs) continue;
      set.add(item.categoryId);
    }
    return set;
  }, [indexedCategories, dateRange, selectedSet]);

  const handleAddInclude = useCallback(
    (id: string) =>
      setSelectedCategoryIds((prev) =>
        prev.includes(id) ? prev : [...prev, id],
      ),
    [],
  );
  const handleRemoveInclude = useCallback(
    (id: string) =>
      setSelectedCategoryIds((prev) => prev.filter((x) => x !== id)),
    [],
  );

  // Maps a series ID (incl. the synthetic `__other`) to display data
  // for both the chart and the breakdown list. Centralised so the two
  // stay in visual lockstep — same colour, same label, same icon.
  const resolveSeries = useCallback(
    (id: string): BreakdownSeriesResolution => {
      if (id === OTHER_SERIES_ID) {
        return {
          name: translate('expenses.overviewOtherSeries'),
          color: theme.colors.outlineVariant,
          iconName: 'more-horiz',
        };
      }
      const r = lookup.resolve(id);
      return { name: r.name, color: r.color, iconName: r.iconName };
    },
    [lookup, theme.colors.outlineVariant, translate],
  );

  const resolveSeriesName = useCallback(
    (id: string) => resolveSeries(id).name,
    [resolveSeries],
  );
  const resolveSeriesColor = useCallback(
    (id: string) => resolveSeries(id).color,
    [resolveSeries],
  );

  return {
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
  };
}
