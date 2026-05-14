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
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  ActivityIndicator,
  FAB,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

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
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const incomingCategoryId =
    typeof params.categoryId === 'string' && params.categoryId.length > 0
      ? params.categoryId
      : undefined;

  const [includeIds, setIncludeIds] = useState<string[]>(
    incomingCategoryId ? [incomingCategoryId] : [],
  );
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ExpenseProjection | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  /**
   * Apply an incoming `categoryId` route param whenever the screen gains
   * focus. We can't rely on the `useState` initializer above (like the web
   * frontend does) because Expo Router's tab navigator keeps tab screens
   * mounted across tab switches — so the initializer only ever runs once.
   * `useFocusEffect` is the React Navigation pattern designed exactly for
   * "the screen just became active": it fires on every focus and we clear
   * the param afterwards so re-tapping the same category re-applies.
   */
  useFocusEffect(
    useCallback(() => {
      if (!incomingCategoryId) return;
      setIncludeIds((prev) =>
        prev.includes(incomingCategoryId) ? prev : [...prev, incomingCategoryId],
      );
      router.setParams({ categoryId: '' });
    }, [incomingCategoryId, router]),
  );

  const { expenses, loading } = useExpenses();
  const { dateRange, preset } = useDateRange();
  const { mainCurrency } = useMainCurrency();
  const lookup = useCategoryLookup();
  const { convert } = useExchangeRates();

  const inRange = useMemo(() => {
    const fromMs = dateRange.from.getTime();
    const toMs = dateRange.to.getTime();
    return expenses.filter((e) => {
      if (!e.date) return false;
      const t = new Date(e.date).getTime();
      return t >= fromMs && t <= toMs;
    });
  }, [expenses, dateRange]);

  /**
   * Categories that the filter picker can offer: any category that has at
   * least one expense in the current date range, minus the ones already
   * selected. Mirrors the web frontend's "unselectedCategories" set.
   */
  const availableCategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of inRange) {
      if (e.categoryId && !includeIds.includes(e.categoryId)) {
        set.add(e.categoryId);
      }
    }
    return set;
  }, [inRange, includeIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange
      .filter((e) => {
        if (includeIds.length > 0 && (!e.categoryId || !includeIds.includes(e.categoryId))) return false;
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
  }, [inRange, includeIds, query, lookup]);

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
            availableCategoryIds={availableCategoryIds}
            onAddInclude={(id) =>
              setIncludeIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
            }
            onRemoveInclude={(id) => setIncludeIds((prev) => prev.filter((x) => x !== id))}
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
                    paddingTop: 10,
                    paddingBottom: 8,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: theme.dark
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(0,0,0,0.05)',
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.outlineVariant,
                  }}
                >
                  {/*
                   * Day variant mirrors the web ExpenseGroupHeader: large
                   * day-of-month on the left, weekday + month/year stacked
                   * on the right. Day number and weekday use `onSurface`
                   * (full contrast) so the header reads as the anchor of
                   * the group; month/year is the secondary line. Coarser
                   * groupings keep the single-line label from `groupLabel`.
                   */}
                  {groupBy === 'day' ? (
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    >
                      <Text
                        style={{
                          fontSize: 30,
                          fontWeight: '500',
                          lineHeight: 32,
                          color: theme.colors.onSurface,
                        }}
                      >
                        {g.date.getDate().toString().padStart(2, '0')}
                      </Text>
                      <View>
                        <Text
                          variant="labelMedium"
                          style={{
                            color: theme.colors.onSurface,
                            fontWeight: '700',
                            lineHeight: 16,
                          }}
                        >
                          {g.date.toLocaleDateString(i18n.language, { weekday: 'long' }).toUpperCase()}
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            fontWeight: '600',
                            lineHeight: 16,
                          }}
                        >
                          {g.date.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }).toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onSurface, fontWeight: '700' }}
                    >
                      {g.label}
                    </Text>
                  )}
                  <Text
                    variant="titleMedium"
                    style={{ color: theme.colors.onSurface, fontWeight: '700' }}
                  >
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
                          <Text variant="bodyMedium" numberOfLines={1}>
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
                          <Text variant="bodyMedium">
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
