/**
 * Category picker dialog — search field + scrollable list of the user's
 * categories. Built on top of `AppDialog` so it shares the title row,
 * close button, and themed background with every other picker.
 *
 * Filtering: case-insensitive substring match against the resolved
 * display name (no diacritic folding for now).
 *
 * Ordering is the user's choice and lives here rather than in a preference:
 * it's cheap to re-pick and only meaningful while choosing. See
 * `domain/categoryOrder.ts` for why it can't be done in SQL.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Dialog,
  Icon,
  Text,
  TextInput,
  Tooltip,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import { CategoryAvatar } from './CategoryAvatar';
import { PortalSafeTextInput } from './PortalSafeTextInput';
import { useCategories } from '../hooks/useCategories';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import { useExpenses } from '../hooks/useExpenses';
import { radius } from '../theme/tokens';
import {
  buildCategoryUsage,
  sortCategories,
  type CategorySortMode,
} from '../domain/categoryOrder';

const SORT_OPTIONS: ReadonlyArray<{
  readonly mode: CategorySortMode;
  readonly icon: string;
}> = [
  { mode: 'alpha', icon: 'sort-alphabetical-variant' },
  { mode: 'used', icon: 'sort-variant' },
  { mode: 'recent', icon: 'history' },
];

export interface CategoryPickerDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly onPick: (categoryId: string) => void;
  /**
   * Optional whitelist of category IDs to show. When omitted, all
   * categories are shown. Used by the transactions filter to restrict
   * choices to categories that actually have expenses in range.
   */
  readonly availableIds?: ReadonlySet<string>;
}

export function CategoryPickerDialog({
  visible,
  onDismiss,
  onPick,
  availableIds,
}: CategoryPickerDialogProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const { categories } = useCategories();
  const { expenses } = useExpenses();
  const lookup = useCategoryLookup();
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<CategorySortMode>('used');

  const usage = useMemo(() => buildCategoryUsage(expenses), [expenses]);

  const sortLabels: Record<CategorySortMode, string> = {
    alpha: translate('categoryDialog.sortAlpha'),
    used: translate('categoryDialog.sortUsed'),
    recent: translate('categoryDialog.sortRecent'),
  };

  // Bound to the active language: comparing with `<` orders by code point,
  // which mis-sorts diacritics and mixed Cyrillic/Latin lists.
  const compareName = useMemo(() => {
    const collator = new Intl.Collator(i18n.language, { sensitivity: 'base' });
    return (a: string, b: string) => collator.compare(a, b);
  }, [i18n.language]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = availableIds
      ? categories.filter((c) => availableIds.has(c.id))
      : categories;
    const rows = source.map((c) => ({ id: c.id, ...lookup.resolve(c.id) }));
    const matching = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    return sortCategories(matching, sortMode, usage, compareName);
  }, [categories, lookup, query, availableIds, sortMode, usage, compareName]);

  const handleDismiss = (): void => {
    setQuery('');
    onDismiss();
  };

  const handlePick = (id: string): void => {
    setQuery('');
    onPick(id);
  };

  return (
    <AppDialog
      visible={visible}
      onDismiss={handleDismiss}
      title={translate('categoryDialog.pickTitle')}
    >
      <Dialog.Content style={styles.content}>
        {/* PortalSafeTextInput, not Paper's TextInput directly — see
            PortalSafeTextInput.tsx for the Portal cursor-jump bug. */}
        <PortalSafeTextInput
          shape="search"
          dense
          placeholder={translate('categoryDialog.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          left={<TextInput.Icon icon="magnify" />}
          right={
            query.length > 0 ? (
              <TextInput.Icon icon="close" onPress={() => setQuery('')} />
            ) : undefined
          }
          style={{ backgroundColor: theme.colors.surface }}
        />
        {/* Hand-rolled rather than `SegmentedButtons`, whose buttons are
            config objects and so can't host a `Tooltip`. Icon-only: three
            labels would wrap in the longer languages. */}
        <View style={[styles.sort, { borderColor: theme.colors.outline }]}>
          {SORT_OPTIONS.map(({ mode, icon }, index) => {
            const selected = sortMode === mode;
            return (
              // Tooltip's own wrapper has no flex, so the equal-thirds
              // sizing has to come from a parent.
              <View key={mode} style={styles.sortSegment}>
                <Tooltip title={sortLabels[mode]}>
                  <TouchableRipple
                    onPress={() => setSortMode(mode)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={sortLabels[mode]}
                    style={[
                      styles.sortButton,
                      index > 0
                        ? { borderLeftWidth: 1, borderLeftColor: theme.colors.outline }
                        : null,
                      selected
                        ? { backgroundColor: theme.colors.secondaryContainer }
                        : null,
                    ]}
                  >
                    <Icon
                      source={icon}
                      size={18}
                      color={
                        selected
                          ? theme.colors.onSecondaryContainer
                          : theme.colors.onSurfaceVariant
                      }
                    />
                  </TouchableRipple>
                </Tooltip>
              </View>
            );
          })}
        </View>
      </Dialog.Content>
      <Dialog.ScrollArea style={styles.scrollArea}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <Text
              style={[
                styles.emptyText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {query
                ? translate('categoryDialog.noMatches')
                : translate('categoryDialog.empty')}
            </Text>
          ) : (
            filtered.map((row) => (
              <TouchableRipple key={row.id} onPress={() => handlePick(row.id)}>
                <View style={styles.row}>
                  <CategoryAvatar iconName={row.iconName} color={row.color} />
                  <Text
                    variant="bodyLarge"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {row.name}
                  </Text>
                </View>
              </TouchableRipple>
            ))
          )}
        </ScrollView>
      </Dialog.ScrollArea>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  sort: {
    marginTop: 12,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  sortSegment: {
    flex: 1,
  },
  sortButton: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyText: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
});
