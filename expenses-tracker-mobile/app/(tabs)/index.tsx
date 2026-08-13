/**
 * Categories screen — primary entry point.
 *
 * Lists every active category sorted by spending in the current period
 * (matches the web frontend's `CategoriesPage`), above a donut chart of the
 * same data.
 *
 * On a window wide enough for Material's "expanded" class the two stack
 * side by side instead: the total + donut hold a left pane while the ranked
 * list scrolls in a right pane. A single column that wide would strand each
 * row's avatar against the far-left edge and its amount against the
 * far-right one.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { SpendingHeader } from '../../src/components/SpendingHeader';
import { CategoryRow } from '../../src/components/CategoryRow';
import { CategoryDonutChart, type DonutSlice } from '../../src/components/CategoryDonutChart';
import { AddExpenseDialog } from '../../src/components/AddExpenseDialog';
import { EmptyState } from '../../src/components/EmptyState';
import { GlowFab } from '../../src/components/GlowFab';
import { useExpenses } from '../../src/hooks/useExpenses';
import { useCategoryLookup } from '../../src/hooks/useCategoryLookup';
import { useCategorySummary } from '../../src/hooks/useCategorySummary';
import { useConvertedExpenses } from '../../src/hooks/useExchangeRates';
import { useDateRange, useMainCurrency } from '../../src/context/preferencesProvider';
import { layoutStyles, useContentGutter, useIsWideLayout } from '../../src/theme/layout';

// The donut gets a pane to itself in the two-pane layout, so it can afford
// to be larger than when it shares a scrolling column with the list.
const DONUT_SIZE = 220;
const DONUT_SIZE_WIDE = 300;

// Share of the window a phone-sized donut may take. Without it the chart is a
// fixed 220 on every device, so a small screen — more so at a large font size,
// where the hero and tab bar both grow — pushes the ranked list off the fold
// entirely and the screen looks empty.
const DONUT_VIEWPORT_SHARE = 0.28;

// Vertical room the summary pane keeps for the total + period picker sitting
// above the donut, so a short window shrinks the chart instead of colliding.
const SUMMARY_HEADER_RESERVE = 200;

export default function CategoriesScreen() {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { expenses, loading } = useExpenses();
  const { dateRange } = useDateRange();
  const { mainCurrency } = useMainCurrency();
  const lookup = useCategoryLookup();
  const convertedExpenses = useConvertedExpenses(expenses);
  const { categories, grandTotal } = useCategorySummary(convertedExpenses, dateRange);
  const [addOpen, setAddOpen] = useState(false);
  const isWideLayout = useIsWideLayout();
  const gutter = useContentGutter();
  const { height: windowHeight } = useWindowDimensions();

  const showCategoryTransactions = useCallback(
    (categoryId: string) => {
      router.push({ pathname: '/(tabs)/transactions', params: { categoryId } });
    },
    [router],
  );

  /**
   * `categories` is already filtered to entries with activity in the
   * selected period by `useCategorySummary`, so this is just a defensive
   * filter; memoizing keeps the array identity stable so the donut chart
   * doesn't re-derive its SVG paths on unrelated renders.
   */
  const active = useMemo(
    () => categories.filter((c) => c.total.amount > 0),
    [categories],
  );

  const slices = useMemo<DonutSlice[]>(
    () =>
      active.map((c) => {
        const r = lookup.resolve(c.categoryId);
        return {
          id: c.categoryId,
          label: r.name,
          value: c.total.amount,
          color: r.color,
          approx: c.total.approx,
        };
      }),
    [active, lookup],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  // With nothing to chart the left pane would be empty, so an empty period
  // stays single-column no matter how wide the window is.
  const twoPane = isWideLayout && active.length > 0;

  const donutSize = twoPane
    ? Math.min(DONUT_SIZE_WIDE, Math.max(DONUT_SIZE, windowHeight - SUMMARY_HEADER_RESERVE))
    : Math.min(DONUT_SIZE, Math.round(windowHeight * DONUT_VIEWPORT_SHARE));

  const summary = (
    <>
      <SpendingHeader total={grandTotal} currency={mainCurrency} />

      {active.length > 0 ? (
        <View style={twoPane ? styles.donutPane : styles.donutBlock}>
          <CategoryDonutChart
            slices={slices}
            size={donutSize}
            currency={mainCurrency}
            language={i18n.language}
          />
        </View>
      ) : null}
    </>
  );

  const list =
    active.length === 0 ? (
      <EmptyState
        title={translate('expenses.noExpensesYet')}
        description={translate('expenses.tapPlusHint')}
      />
    ) : (
      <View style={styles.listInset}>
        {active.map((cat, index) => {
          const resolved = lookup.resolve(cat.categoryId);
          return (
            <CategoryRow
              key={cat.categoryId}
              categoryId={cat.categoryId}
              name={resolved.name}
              color={resolved.color}
              iconName={resolved.iconName}
              percentage={cat.percentage}
              amount={cat.total.amount}
              approx={cat.total.approx}
              currency={mainCurrency}
              language={i18n.language}
              index={index}
              onPress={showCategoryTransactions}
            />
          );
        })}
      </View>
    );

  return (
    <View style={[{ flex: 1 }, layoutStyles.contentColumn, { paddingHorizontal: gutter }]}>
      {twoPane ? (
        <View style={layoutStyles.panes}>
          <View style={layoutStyles.pane}>{summary}</View>
          <View style={[layoutStyles.paneDivider, { backgroundColor: theme.colors.outlineVariant }]} />
          <ScrollView style={layoutStyles.pane} contentContainerStyle={styles.listContent}>
            {list}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {summary}
          {list}
        </ScrollView>
      )}

      <GlowFab
        icon={<MaterialIcons name="add" size={28} color="#ffffff" />}
        onPress={() => setAddOpen(true)}
        accessibilityLabel={translate('expenses.addAriaLabel')}
        style={{ position: 'absolute', right: 18, bottom: 18 }}
      />
      <AddExpenseDialog visible={addOpen} onDismiss={() => setAddOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Centred in the space left under the header so the donut sits in the
  // optical middle of its pane rather than hugging the total.
  donutPane: {
    flex: 1,
    justifyContent: 'center',
  },
  donutBlock: {
    paddingVertical: 8,
  },
  // The row owns no horizontal inset — it's shared with the Overview
  // breakdown, whose container insets differently.
  listInset: {
    paddingHorizontal: 14,
  },
  // Clears the FAB so the last row can always be scrolled out from under it.
  listContent: {
    paddingBottom: 96,
  },
});
