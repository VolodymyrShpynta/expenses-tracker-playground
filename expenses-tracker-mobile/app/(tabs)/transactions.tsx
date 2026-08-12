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
import { memo, useCallback, useMemo, useState, useTransition } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { SpendingHeader } from '../../src/components/SpendingHeader';
import { CategoryAvatar } from '../../src/components/CategoryAvatar';
import { AddExpenseDialog } from '../../src/components/AddExpenseDialog';
import { EmptyState } from '../../src/components/EmptyState';
import { GlowFab } from '../../src/components/GlowFab';
import { TransactionFilters } from '../../src/components/TransactionFilters';
import { useExpenses } from '../../src/hooks/useExpenses';
import {
  useCategoryLookup,
  type CategoryLookup,
} from '../../src/hooks/useCategoryLookup';
import { useDateRange, useMainCurrency, FONT_SCALES, useFontScale } from '../../src/context/preferencesProvider';
import { formatAmountCompactIfLarge, formatTotalCompactWithCurrency } from '../../src/utils/format';
import { formatDate, presetToGroupBy, type GroupBy } from '../../src/utils/dateRange';
import { groupExpenses } from '../../src/utils/groupExpenses';
import { useExchangeRates } from '../../src/hooks/useExchangeRates';
import type { ConvertedAmount } from '../../src/domain/exchangeRates';
import { sumAmounts } from '../../src/domain/exchangeRates';
import type { ExpenseProjection } from '../../src/domain/types';
import { useAppColors } from '../../src/theme/appColors';
import { layoutStyles, useContentGutter } from '../../src/theme/layout';
import { radius } from '../../src/theme/tokens';
import { interFont } from '../../src/theme/typography';

/** Side margin of the grouped card that holds each section's rows. */
const GROUP_INSET = 14;
/**
 * Card outline, matching `AppCard` and the header pills. A white card on the
 * near-white page is a 2% luminance step — invisible on its own — so the
 * border is what actually draws the group.
 */
const GROUP_BORDER = 1;
/** Leading tile in an expense row. */
const ROW_TILE_SIZE = 40;
const ROW_PADDING = 14;
const ROW_GAP = 12;
/**
 * Row separators start where the text does, not at the card edge. A
 * full-bleed rule reads as a table; an inset one reads as a list inside a
 * card, which is the difference the outline alone can't make.
 */
const DIVIDER_INSET = ROW_PADDING + ROW_TILE_SIZE + ROW_GAP;

/**
 * Memoized expense row hoisted to module scope. With stable props
 * (`lookup`, `convert`, `onPress`, currency/language/colors) React.memo's
 * shallow compare bails out for unchanged rows, so toggling one section's
 * collapsed state does **not** re-render every visible row in the list.
 * This is the single biggest factor in keeping expand/collapse snappy on
 * mobile — without it, each parent re-render forces hundreds of row
 * render functions to re-run their `lookup.resolve` + `Intl.NumberFormat`
 * work.
 */
interface ExpenseRowProps {
  readonly expense: ExpenseProjection;
  readonly mainCurrency: string;
  readonly language: string;
  readonly lookup: CategoryLookup;
  readonly convert: (
    amount: number,
    fromCurrency: string,
    date?: string,
  ) => ConvertedAmount;
  readonly onPress: (expense: ExpenseProjection) => void;
  readonly secondaryColor: string;
  readonly surfaceColor: string;
  readonly borderColor: string;
  /**
   * Rows share one grouped card with their section header, which owns the
   * top corners — so a row only ever rounds its bottom, and only the last
   * one does. Inner rows draw a divider instead.
   */
  readonly isLast: boolean;
  /**
   * Current section granularity. When the list is grouped by day the
   * section header already announces the date, so the row keeps its
   * compact "category-only" subtitle. For coarser groupings (month /
   * year) we append a short `day · month` label next to the category —
   * mirrors the web `ExpenseRow` behaviour.
   */
  readonly groupBy: GroupBy;
}

const ExpenseRow = memo(function ExpenseRow({
  expense,
  mainCurrency,
  language,
  lookup,
  convert,
  onPress,
  secondaryColor,
  surfaceColor,
  borderColor,
  isLast,
  groupBy,
}: ExpenseRowProps) {
  const resolved = lookup.resolve(expense.categoryId);
  const showConverted = expense.currency !== mainCurrency;
  const converted = showConverted
    ? convert(expense.amount, expense.currency, expense.date)
    : null;
  const dateLabel =
    groupBy !== 'day' && expense.date
      ? new Date(expense.date).toLocaleDateString(language, {
          day: 'numeric',
          month: 'short',
        })
      : null;
  return (
    <Pressable
      onPress={() => onPress(expense)}
      style={({ pressed }) => [
        rowStyles.row,
        { backgroundColor: surfaceColor, borderColor, opacity: pressed ? 0.7 : 1 },
        isLast ? rowStyles.last : null,
      ]}
    >
      <View style={rowStyles.body}>
        <CategoryAvatar
          iconName={resolved.iconName}
          color={resolved.color}
          size={ROW_TILE_SIZE}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={rowStyles.title}>
            {expense.description || resolved.name}
          </Text>
          <Text numberOfLines={1} style={[rowStyles.subtitle, { color: secondaryColor }]}>
            {dateLabel ? `${resolved.name} · ${dateLabel}` : resolved.name}
          </Text>
        </View>
        {/* Amount column: fixed to its natural single-line width and never
            shrinks (the description column yields instead). Both lines
            stretch to the column width and right-align their text, so the
            shorter secondary amount ("USD 100,00") uses the full column
            width and can't ellipsize just because it's narrower than the
            main line above it. numberOfLines={1} also stops a
            space-separated amount from breaking after the currency code. */}
        <View style={{ minWidth: 90, flexShrink: 0 }}>
          <Text numberOfLines={1} style={rowStyles.amount}>
            {converted
              ? formatAmountCompactIfLarge(converted.amount, mainCurrency, language, converted.approx)
              : formatAmountCompactIfLarge(expense.amount, expense.currency, language)}
          </Text>
          {converted ? (
            <Text
              numberOfLines={1}
              style={[rowStyles.amountSecondary, { color: secondaryColor }]}
            >
              {formatAmountCompactIfLarge(expense.amount, expense.currency, language)}
            </Text>
          ) : null}
        </View>
      </View>
      {isLast ? null : (
        <View style={[rowStyles.divider, { backgroundColor: borderColor }]} />
      )}
    </Pressable>
  );
});

const rowStyles = StyleSheet.create({
  row: {
    marginHorizontal: GROUP_INSET,
    borderLeftWidth: GROUP_BORDER,
    borderRightWidth: GROUP_BORDER,
  },
  last: {
    borderBottomWidth: GROUP_BORDER,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  divider: { height: GROUP_BORDER, marginLeft: DIVIDER_INSET },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: 12,
    paddingHorizontal: ROW_PADDING,
  },
  title: { fontFamily: interFont.medium, fontSize: 15 },
  subtitle: { fontFamily: interFont.regular, fontSize: 12.5, marginTop: 2 },
  amount: { fontFamily: interFont.semiBold, fontSize: 15, textAlign: 'right' },
  amountSecondary: {
    fontFamily: interFont.regular,
    fontSize: 12.5,
    marginTop: 2,
    textAlign: 'right',
  },
});

/**
 * Memoized section header. We deliberately pass primitives (not the
 * `section` object, and not the `ConvertedAmount` total) so React.memo
 * can bail out for unchanged sections: the parent rebuilds the
 * `sections` array on every collapse toggle, so each section object
 * literal and each `total` value object is a new reference even when
 * its content didn't change. Primitives compare by value and let the
 * shallow compare succeed for every section except the one the user
 * actually tapped.
 */
interface SectionHeaderViewProps {
  readonly sectionKey: string;
  readonly label: string;
  readonly dateMs: number;
  readonly total: number;
  readonly approx: boolean;
  readonly collapsed: boolean;
  readonly groupBy: GroupBy;
  readonly language: string;
  readonly mainCurrency: string;
  readonly onSurface: string;
  readonly onSurfaceVariant: string;
  readonly surfaceColor: string;
  readonly borderColor: string;
  readonly onToggle: (key: string) => void;
}

const SectionHeaderView = memo(function SectionHeaderView({
  sectionKey,
  label,
  dateMs,
  total,
  approx,
  collapsed,
  groupBy,
  language,
  mainCurrency,
  onSurface,
  onSurfaceVariant,
  surfaceColor,
  borderColor,
  onToggle,
}: SectionHeaderViewProps) {
  const date = new Date(dateMs);
  // Honor Settings → Font size so the big day number stays proportional to
  // the (theme-variant, already-scaling) weekday / month labels beside it.
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];
  return (
    <Pressable
      onPress={() => onToggle(sectionKey)}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      style={({ pressed }) => [
        headerStyles.header,
        { backgroundColor: surfaceColor, borderColor },
        // Collapsed, the header *is* the whole card, so it closes both ends;
        // expanded, its bottom edge divides it from the rows.
        collapsed ? headerStyles.closed : null,
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      {/*
       * Day variant mirrors the web ExpenseGroupHeader: large day-of-month
       * on the left, weekday + month/year stacked beside it. Coarser
       * groupings keep the single-line label.
       */}
      {groupBy === 'day' ? (
        <View style={headerStyles.dayGroup}>
          <Text
            style={{
              fontFamily: interFont.extraBold,
              fontSize: Math.round(30 * scale),
              lineHeight: Math.round(32 * scale),
              letterSpacing: -0.035 * 30 * scale,
              color: onSurface,
            }}
          >
            {date.getDate().toString().padStart(2, '0')}
          </Text>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[headerStyles.weekday, { color: onSurface }]}>
              {date.toLocaleDateString(language, { weekday: 'long' }).toUpperCase()}
            </Text>
            <Text numberOfLines={1} style={[headerStyles.month, { color: onSurfaceVariant }]}>
              {formatDate(date, language, {
                month: 'long',
                year: 'numeric',
              }).toUpperCase()}
            </Text>
          </View>
        </View>
      ) : (
        <Text numberOfLines={1} style={[headerStyles.label, { color: onSurface }]}>
          {label}
        </Text>
      )}
      <View style={headerStyles.totalGroup}>
        <Text style={[headerStyles.total, { color: onSurface }]}>
          {formatTotalCompactWithCurrency(total, mainCurrency, language, approx)}
        </Text>
        <MaterialIcons
          name={collapsed ? 'chevron-right' : 'expand-more'}
          size={22}
          color={onSurfaceVariant}
        />
      </View>
    </Pressable>
  );
});

const headerStyles = StyleSheet.create({
  header: {
    marginTop: 18,
    marginHorizontal: GROUP_INSET,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: GROUP_BORDER,
    borderLeftWidth: GROUP_BORDER,
    borderRightWidth: GROUP_BORDER,
    borderBottomWidth: GROUP_BORDER,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closed: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  dayGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  weekday: { fontFamily: interFont.bold, fontSize: 12, letterSpacing: 0.8, lineHeight: 16 },
  month: { fontFamily: interFont.medium, fontSize: 11, letterSpacing: 0.6, lineHeight: 16 },
  label: { fontFamily: interFont.bold, fontSize: 16, flexShrink: 1, minWidth: 0 },
  totalGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 8,
  },
  total: { fontFamily: interFont.extraBold, fontSize: 16, letterSpacing: -0.3 },
});

export default function TransactionsScreen() {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const gutter = useContentGutter();
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
   * Per-group collapsed state. Groups are expanded by default; tapping a
   * header toggles its key in this set. We keep this local to the screen
   * (no persistence across tab switches needed) and intentionally don't
   * prune stale keys when filters change — re-tapping a header is cheap
   * and the set stays tiny relative to the visible list.
   */
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /**
   * `startTransition` marks the collapse update as **non-urgent** so
   * React can keep the UI thread free for the press-feedback animation
   * (TouchableRipple) while the heavy reconciliation — mounting or
   * unmounting the section's rows — runs in the background. Without
   * this, on a list with ~2k expenses split into a dozen month-sections
   * (~150 rows each), unmounting the mounted-row window of one section
   * synchronously blocks the JS thread for ~1–2s on mid-range Android.
   *
   * If the user taps another header before the previous transition
   * commits, React discards the in-flight work — so rapid tapping no
   * longer queues up multiple expensive reconciliations.
   */
  const [, startCollapseTransition] = useTransition();
  const toggleCollapsed = useCallback((key: string) => {
    startCollapseTransition(() => {
      setCollapsedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    });
  }, []);

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

  const grandTotal = useMemo<ConvertedAmount>(
    () => sumAmounts(filtered.map((e) => convert(e.amount, e.currency, e.date))),
    [filtered, convert],
  );

  const groupBy = presetToGroupBy(preset, dateRange);
  const groups = useMemo(
    () => groupExpenses(filtered, groupBy, i18n.language),
    [filtered, groupBy, i18n.language],
  );

  /**
   * Sections fed to `SectionList`. We pre-compute the converted total per
   * group here so the section header doesn't redo the reduce on every
   * scroll-induced re-render. Collapsed groups expose an empty `data`
   * array so their header still renders but no expense rows are mounted.
   */
  const sections = useMemo(
    () =>
      groups.map((g) => {
        const total = sumAmounts(
          g.expenses.map((e) => convert(e.amount, e.currency, e.date)),
        );
        return {
          key: g.key,
          label: g.label,
          date: g.date,
          total,
          data: collapsedKeys.has(g.key)
            ? ([] as ReadonlyArray<ExpenseProjection>)
            : g.expenses,
        };
      }),
    [groups, collapsedKeys, convert],
  );

  /**
   * Stable callbacks + memoized header element. The memoized
   * `ExpenseRow` / `SectionHeaderView` rely on these refs not changing
   * between renders to bail out of the shallow compare.
   */
  const handleEditPress = useCallback(
    (expense: ExpenseProjection) => setEditing(expense),
    [],
  );
  const handleAddInclude = useCallback(
    (id: string) => setIncludeIds((prev) => (prev.includes(id) ? prev : [...prev, id])),
    [],
  );
  const handleRemoveInclude = useCallback(
    (id: string) => setIncludeIds((prev) => prev.filter((x) => x !== id)),
    [],
  );

  const secondaryColor = theme.colors.onSurfaceVariant;
  const onSurfaceColor = theme.colors.onSurface;
  const appColors = useAppColors();
  const surfaceColor = theme.colors.surface;
  // Same weight as the period pills in `SpendingHeader`; anything heavier
  // reads as a table rule rather than a card edge.
  const borderColor = appColors.border;

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: ExpenseProjection;
      index: number;
      section: (typeof sections)[number];
    }) => (
      <ExpenseRow
        expense={item}
        mainCurrency={mainCurrency}
        language={i18n.language}
        lookup={lookup}
        convert={convert}
        onPress={handleEditPress}
        secondaryColor={secondaryColor}
        surfaceColor={surfaceColor}
        borderColor={borderColor}
        isLast={index === section.data.length - 1}
        groupBy={groupBy}
      />
    ),
    [
      mainCurrency,
      i18n.language,
      lookup,
      convert,
      handleEditPress,
      secondaryColor,
      surfaceColor,
      borderColor,
      groupBy,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: (typeof sections)[number] }) => (
      <SectionHeaderView
        sectionKey={section.key}
        label={section.label}
        dateMs={section.date.getTime()}
        total={section.total.amount}
        approx={section.total.approx}
        collapsed={collapsedKeys.has(section.key)}
        groupBy={groupBy}
        language={i18n.language}
        mainCurrency={mainCurrency}
        onSurface={onSurfaceColor}
        onSurfaceVariant={secondaryColor}
        surfaceColor={surfaceColor}
        borderColor={borderColor}
        onToggle={toggleCollapsed}
      />
    ),
    [
      collapsedKeys,
      groupBy,
      i18n.language,
      mainCurrency,
      onSurfaceColor,
      secondaryColor,
      surfaceColor,
      borderColor,
      toggleCollapsed,
    ],
  );

  const listHeader = useMemo(
    () => (
      <>
        <SpendingHeader
          total={grandTotal}
          currency={mainCurrency}
        />
        <TransactionFilters
          query={query}
          onQueryChange={setQuery}
          includeIds={includeIds}
          availableCategoryIds={availableCategoryIds}
          onAddInclude={handleAddInclude}
          onRemoveInclude={handleRemoveInclude}
        />
      </>
    ),
    [
      grandTotal,
      mainCurrency,
      query,
      includeIds,
      availableCategoryIds,
      handleAddInclude,
      handleRemoveInclude,
    ],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  /*
   * `SectionList` virtualizes the list: only rows currently on screen (plus
   * a small buffer set by `windowSize`) are mounted. As the user scrolls,
   * off-screen rows are unmounted and new ones below mount in their place —
   * the "smooth pagination" effect applied to an in-memory dataset. This
   * keeps the screen responsive even with thousands of expenses in a single
   * range.
   *
   * `SpendingHeader` + `TransactionFilters` go into `ListHeaderComponent` so
   * they scroll with the rest of the content and stay above the first section
   * header. This screen stays single-column at every window size: its header
   * is only a total, a period picker and a search field, which leaves a pane
   * of its own mostly empty.
   */
  const list = (
    <SectionList<ExpenseProjection, (typeof sections)[number]>
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 96 }}
      /*
       * Tight windowing: with ~150 rows per month-section on a yearly range,
       * the perceived expand/collapse latency is dominated by how many native
       * views must be mounted or unmounted synchronously when a section's
       * `data` flips between `[]` and the full array. Halving `windowSize`
       * roughly halves that work; `maxToRenderPerBatch` keeps the batches
       * small enough that subsequent paints don't stutter.
       * `initialNumToRender` is intentionally generous so the first screen
       * paints fully on a cold open.
       *
       * `removeClippedSubviews` is already `true` by default on Android and
       * has known interaction issues with nested touchables, so we leave it
       * unset rather than forcing it.
       */
      initialNumToRender={20}
      maxToRenderPerBatch={4}
      windowSize={4}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <EmptyState
          title={translate('expenses.noTransactions')}
          description={translate('expenses.tapPlusHint')}
        />
      }
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
    />
  );

  return (
    <>
      <View style={[{ flex: 1 }, layoutStyles.contentColumn, { paddingHorizontal: gutter }]}>
        {list}

        <GlowFab
          icon={<MaterialIcons name="add" size={28} color="#ffffff" />}
          onPress={() => setAddOpen(true)}
          accessibilityLabel={translate('expenses.addAriaLabel')}
          style={{ position: 'absolute', right: 18, bottom: 18 }}
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
