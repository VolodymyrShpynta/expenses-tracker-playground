/**
 * Filter row for the transactions screen.
 *
 *   [ search box                  ]  [ ⚙ ]
 *   [chip] [chip] [chip] …                (active filters, dismissible)
 *
 * State for `query`, `selectedCategoryIds` and `unselectedCategoryIds` is
 * lifted to the screen so the parent can wire it into the expense filter.
 *
 * The category picker is rendered here (not at the screen level) because
 * `AppDialog` uses RN's `Modal` under the hood, which portals to the
 * root window — so the picker can sit anywhere in the tree.
 *
 * The two chip lists mirror the web frontend's "include / exclude" model:
 * if the user explicitly selects categories, only those match; otherwise
 * they may exclude one or more, and everything else passes.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Chip,
  IconButton,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { CategoryAvatar } from './CategoryAvatar';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import { useCategoryLookup } from '../hooks/useCategoryLookup';

export interface TransactionFiltersProps {
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly includeIds: ReadonlyArray<string>;
  readonly excludeIds: ReadonlyArray<string>;
  readonly onAddInclude: (id: string) => void;
  readonly onAddExclude: (id: string) => void;
  readonly onRemoveInclude: (id: string) => void;
  readonly onRemoveExclude: (id: string) => void;
  readonly onClearAll: () => void;
}

type Mode = 'include' | 'exclude' | null;

export function TransactionFilters({
  query,
  onQueryChange,
  includeIds,
  excludeIds,
  onAddInclude,
  onAddExclude,
  onRemoveInclude,
  onRemoveExclude,
  onClearAll,
}: TransactionFiltersProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const lookup = useCategoryLookup();
  const [pickerMode, setPickerMode] = useState<Mode>(null);

  const hasFilters = includeIds.length > 0 || excludeIds.length > 0 || query.length > 0;

  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <TextInput
          mode="outlined"
          dense
          placeholder={translate('transactions.searchPlaceholder')}
          value={query}
          onChangeText={onQueryChange}
          left={<TextInput.Icon icon="magnify" />}
          style={{ flex: 1, backgroundColor: theme.colors.surface }}
        />
        <IconButton
          icon="filter-variant"
          accessibilityLabel={translate('transactions.openFilter')}
          onPress={() => setPickerMode('include')}
        />
        {hasFilters ? (
          <IconButton
            icon="close"
            accessibilityLabel={translate('transactions.clearFilters')}
            onPress={onClearAll}
          />
        ) : null}
      </View>

      {(includeIds.length > 0 || excludeIds.length > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
          {includeIds.map((id) => {
            const r = lookup.resolve(id);
            return (
              <Chip
                key={`inc-${id}`}
                onClose={() => onRemoveInclude(id)}
                avatar={
                  <View style={{ marginLeft: 4 }}>
                    <CategoryAvatar iconName={r.iconName} color={r.color} size={20} />
                  </View>
                }
                style={{ backgroundColor: theme.colors.secondaryContainer }}
              >
                {r.name}
              </Chip>
            );
          })}
          {excludeIds.map((id) => {
            const r = lookup.resolve(id);
            return (
              <Chip
                key={`exc-${id}`}
                onClose={() => onRemoveExclude(id)}
                icon="minus-circle-outline"
                style={{ backgroundColor: theme.colors.errorContainer }}
              >
                {r.name}
              </Chip>
            );
          })}
          <Chip icon="plus" onPress={() => setPickerMode('exclude')} mode="outlined">
            {translate('transactions.exclude')}
          </Chip>
        </ScrollView>
      )}

      <CategoryPickerDialog
        visible={pickerMode !== null}
        onDismiss={() => setPickerMode(null)}
        onPick={(id) => {
          if (pickerMode === 'include') onAddInclude(id);
          else if (pickerMode === 'exclude') onAddExclude(id);
          setPickerMode(null);
        }}
      />
    </View>
  );
}
