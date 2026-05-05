/**
 * Categories screen — primary entry point.
 *
 * Lists every active category sorted by spending in the current period
 * (matches the web frontend's `CategoriesPage`). The donut chart from the
 * web client is intentionally **not** ported in v1 — it would need
 * `react-native-svg` and a sizable amount of layout code; the ranked list
 * is the same information density without the extra dependency.
 */
import { useState } from 'react';
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
import { formatAmountCompactWithCurrency } from '../../src/utils/format';

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

  const active = categories.filter((c) => c.total > 0);

  const slices: DonutSlice[] = active.map((c) => {
    const r = lookup.resolve(c.categoryId);
    return { id: c.categoryId, label: r.name, value: c.total, color: r.color };
  });

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
          <SpendingHeader totalSpending={grandTotal} currency={mainCurrency} />

          {active.length > 0 ? (
            <View style={{ paddingVertical: 8 }}>
              <CategoryDonutChart
                slices={slices}
                centerValue={formatAmountCompactWithCurrency(grandTotal, mainCurrency, i18n.language)}
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
                        <Text variant="bodyLarge" style={{ fontWeight: '500' }} numberOfLines={1}>
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
                          backgroundColor: theme.dark
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.06)',
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
                      {formatAmountCompactWithCurrency(cat.total, mainCurrency, i18n.language)}
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
