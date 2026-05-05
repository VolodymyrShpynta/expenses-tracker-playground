/**
 * Transactions screen v2 — chronological list of expenses with grouping,
 * search, and multi-category include/exclude filters.
 *
 * Groups (day / month / year) are picked from the active period preset
 * via `presetToGroupBy`, matching the web frontend. Each group renders a
 * sticky-styled header with the period label + total of the visible
 * expenses (we compute totals in the user's main currency via
 * `useExchangeRates`, falling back to raw amounts when rates haven't loaded).
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
import { useLocalSearchParams } from 'expo-router';

import { SpendingHeader } from '../../src/components/SpendingHeader';
import { CategoryAvatar } from '../../src/components/CategoryAvatar';
import { AddExpenseDialog } from '../../src/components/AddExpenseDialog';
import { TransactionFilters } from '../../src/components/TransactionFilters';
import { useExpenses } from '../../src/hooks/useExpenses';
import { useCategoryLookup } from '../../src/hooks/useCategoryLookup';
import { useDateRange, useMainCurrency } from '../../src/context/preferencesProvider';
import { formatAmountWithCurrency } from '../../src/utils/format';
import { presetToGroupBy } from '../../src/utils/dateRange';
import { groupExpenses } from '../../src/utils/groupExpenses';
import { useExchangeRates } from '../../src/hooks/useExchangeRates';
import type { ExpenseProjection } from '../../src/domain/types';

export default function TransactionsScreen() {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const initialCategoryId = typeof params.categoryId === 'string' ? params.categoryId : undefined;

  const [includeIds, setIncludeIds] = useState<string[]>(
    initialCategoryId ? [initialCategoryId] : [],
  );
  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ExpenseProjection | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { expenses, loading } = useExpenses();
  const { dateRange, preset } = useDateRange();
  const { mainCurrency } = useMainCurrency();
  const lookup = useCategoryLookup();
  const { convert } = useExchangeRates();

  const filtered = useMemo(() => {
    const fromMs = dateRange.from.getTime();
    const toMs = dateRange.to.getTime();
    const q = query.trim().toLowerCase();
    return expenses
      .filter((e) => {
        if (!e.date) return false;
        const t = new Date(e.date).getTime();
        if (t < fromMs || t > toMs) return false;
        if (includeIds.length > 0 && (!e.categoryId || !includeIds.includes(e.categoryId))) return false;
        if (e.categoryId && excludeIds.includes(e.categoryId)) return false;
        if (q) {
          const haystack = `${e.description ?? ''} ${lookup.resolve(e.categoryId).name}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });
  }, [expenses, dateRange, includeIds, excludeIds, query, lookup]);

  const grandTotal = useMemo(
    () => filtered.reduce((sum, e) => sum + convert(e.amount, e.currency), 0),
    [filtered, convert],
  );

  const groupBy = presetToGroupBy(preset);
  const groups = useMemo(
    () => groupExpenses(filtered, groupBy, i18n.language),
    [filtered, groupBy, i18n.language],
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
          <SpendingHeader totalSpending={grandTotal} currency={mainCurrency} />

          <TransactionFilters
            query={query}
            onQueryChange={setQuery}
            includeIds={includeIds}
            excludeIds={excludeIds}
            onAddInclude={(id) =>
              setIncludeIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
            }
            onAddExclude={(id) =>
              setExcludeIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
            }
            onRemoveInclude={(id) => setIncludeIds((prev) => prev.filter((x) => x !== id))}
            onRemoveExclude={(id) => setExcludeIds((prev) => prev.filter((x) => x !== id))}
            onClearAll={() => {
              setIncludeIds([]);
              setExcludeIds([]);
              setQuery('');
            }}
          />

          {groups.length === 0 ? (
            <Text
              style={{
                color: theme.colors.onSurfaceVariant,
                textAlign: 'center',
                marginTop: 40,
                paddingHorizontal: 24,
              }}
            >
              {translate('expenses.noTransactions')}
            </Text>
          ) : (
            groups.map((g) => (
              <View key={g.key} style={{ marginTop: 8 }}>
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    backgroundColor: theme.dark
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(0,0,0,0.03)',
                  }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                    {g.label}
                  </Text>
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                    {formatAmountWithCurrency(
                      g.expenses.reduce((s, e) => s + convert(e.amount, e.currency), 0),
                      mainCurrency,
                      i18n.language,
                    )}
                  </Text>
                </View>
                {g.expenses.map((e) => {
                  const resolved = lookup.resolve(e.categoryId);
                  const showConverted = e.currency !== mainCurrency;
                  const convertedAmount = showConverted ? convert(e.amount, e.currency) : 0;
                  return (
                    <TouchableRipple key={e.id} onPress={() => setEditing(e)}>
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
                          <Text variant="bodyLarge" numberOfLines={1}>
                            {e.description || resolved.name}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{ color: theme.colors.onSurfaceVariant }}
                            numberOfLines={1}
                          >
                            {resolved.name}
                          </Text>
                        </View>
                        <View style={{ minWidth: 90, alignItems: 'flex-end' }}>
                          <Text variant="bodyLarge" style={{ fontWeight: '700' }}>
                            {showConverted
                              ? formatAmountWithCurrency(convertedAmount, mainCurrency, i18n.language)
                              : formatAmountWithCurrency(e.amount, e.currency, i18n.language)}
                          </Text>
                          {showConverted ? (
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                            >
                              {formatAmountWithCurrency(e.amount, e.currency, i18n.language)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableRipple>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        <FAB
          icon="plus"
          onPress={() => setAddOpen(true)}
          style={{ position: 'absolute', right: 16, bottom: 16 }}
        />
        <AddExpenseDialog visible={addOpen} onDismiss={() => setAddOpen(false)} />
        {editing ? (
          <AddExpenseDialog
            visible
            expense={editing}
            onDismiss={() => setEditing(null)}
          />
        ) : null}
      </View>
    </>
  );
}
