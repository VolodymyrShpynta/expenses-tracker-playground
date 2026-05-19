/**
 * Filter row for the transactions screen.
 *
 *   [ search box                  ]  [ ⚙ ]
 *   [chip] [chip] [chip] … [+ Add]       (active filters, dismissible on tap)
 *
 * State for `query` and `includeIds` is lifted to the screen so the
 * parent can wire it into the expense filter.
 *
 * The chips row is delegated to the shared `CategoryIncludeFilter`
 * component so the Overview screen and the Transactions screen render
 * the same pill style and stay visually consistent.
 *
 * Mirrors the web frontend: include-only filtering — tapping a chip (or
 * its inline X) removes it. The picker only offers categories that have
 * expenses in the current date range and aren't already selected.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { IconButton, TextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { CategoryIncludeFilter } from './CategoryIncludeFilter';
import { CategoryPickerDialog } from './CategoryPickerDialog';

export interface TransactionFiltersProps {
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly includeIds: ReadonlyArray<string>;
  readonly availableCategoryIds: ReadonlySet<string>;
  readonly onAddInclude: (id: string) => void;
  readonly onRemoveInclude: (id: string) => void;
}

export function TransactionFilters({
  query,
  onQueryChange,
  includeIds,
  availableCategoryIds,
  onAddInclude,
  onRemoveInclude,
}: TransactionFiltersProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  // Local picker for the "open filter" icon button next to the search
  // field — needed because the chips row only renders its own picker
  // when at least one chip is selected (the Add pill is rendered as
  // part of the chips row, not when the row is empty).
  const [pickerOpen, setPickerOpen] = useState(false);

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
          disabled={availableCategoryIds.size === 0}
          onPress={() => setPickerOpen(true)}
        />
      </View>

      {includeIds.length > 0 && (
        <CategoryIncludeFilter
          includeIds={includeIds}
          availableCategoryIds={availableCategoryIds}
          onAddInclude={onAddInclude}
          onRemoveInclude={onRemoveInclude}
          addLabel={translate('transactions.add')}
          style={{ paddingVertical: 6 }}
        />
      )}

      <CategoryPickerDialog
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        availableIds={availableCategoryIds}
        onPick={(id) => {
          onAddInclude(id);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}
