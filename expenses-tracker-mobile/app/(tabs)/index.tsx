/**
 * Categories screen — primary entry point.
 *
 * Lists every active category sorted by spending in the current period
 * (matches the web frontend's `CategoriesPage`). The donut chart from the
 * web client is intentionally **not** ported in v1 — it would need
 * `react-native-svg` and a sizable amount of layout code; the ranked list
 * is the same information density without the extra dependency.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  ActivityIndicator,
  FAB,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { SpendingHeader } from '../../src/components/SpendingHeader';
import { CategoryAvatar } from '../../src/components/CategoryAvatar';
import { CategoryDonutChart, type DonutSlice } from '../../src/components/CategoryDonutChart';
import { AddExpenseDialog } from '../../src/components/AddExpenseDialog';
import { useExpenses } from '../../src/hooks/useExpenses';
import { useCategoryLookup } from '../../src/hooks/useCategoryLookup';
import { useCategorySummary } from '../../src/hooks/useCategorySummary';
import { useConvertedExpenses } from '../../src/hooks/useExchangeRates';
import { useDateRange, useMainCurrency } from '../../src/context/preferencesProvider';
import { formatTotalCompactWithCurrency } from '../../src/utils/format';
import { useAppColors } from '../../src/theme/appColors';

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
  const appColors = useAppColors();

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
        return { id: c.categoryId, label: r.name, value: c.total.amount, color: r.color };
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

  return (
    <>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
          <SpendingHeader total={grandTotal} currency={mainCurrency} />

          {active.length > 0 ? (
            <View style={{ paddingVertical: 8 }}>
              <CategoryDonutChart
                slices={slices}
                centerValue={formatTotalCompactWithCurrency(
                  grandTotal.amount,
                  mainCurrency,
                  i18n.language,
                  grandTotal.approx,
                )}
                centerLabel={translate('expenses.totalSpending')}
              />
            </View>
          ) : null}

          {active.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 24 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {translate('expenses.noExpensesYet')}
              </Text>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
              >
                {translate('expenses.tapPlusHint')}
              </Text>
            </View>
          ) : (
            active.map((cat) => {
              const resolved = lookup.resolve(cat.categoryId);
              const pct = Math.round(cat.percentage);
              return (
                <TouchableRipple
                  key={cat.categoryId}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/transactions',
                      params: { categoryId: cat.categoryId },
                    })
                  }
                >
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
                          style={{ fontWeight: '500', flex: 1, marginRight: 8 }}
                          numberOfLines={1}
                        >
                          {resolved.name}
                        </Text>
                        <Text variant="labelMedium" style={{ color: resolved.color, fontWeight: '700' }}>
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
                      style={{ color: resolved.color, fontWeight: '700', minWidth: 80, textAlign: 'right' }}
                    >
                      {formatTotalCompactWithCurrency(
                        cat.total.amount,
                        mainCurrency,
                        i18n.language,
                        cat.total.approx,
                      )}
                    </Text>
                  </View>
                </TouchableRipple>
              );
            })
          )}
        </ScrollView>

        <FAB
          icon="plus"
          onPress={() => setAddOpen(true)}
          style={{ position: 'absolute', right: 16, bottom: 16 }}
        />
        <AddExpenseDialog visible={addOpen} onDismiss={() => setAddOpen(false)} />
      </View>
    </>
  );
}
