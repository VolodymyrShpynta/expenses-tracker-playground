/**
 * Filter row for the transactions screen.
 *
 *   [ search box                  ]  [ ⚙ ]
 *   [chip] [chip] [chip] … [+ Add]       (active filters, dismissible on tap)
 *
 * State for `query` and `includeIds` is lifted to the screen so the
 * parent can wire it into the expense filter.
 *
 * The category picker is rendered here (not at the screen level) because
 * `AppDialog` uses RN's `Modal` under the hood, which portals to the
 * root window — so the picker can sit anywhere in the tree.
 *
 * Mirrors the web frontend: include-only filtering — tapping a chip (or
 * its inline X) removes it. The picker only offers categories that have
 * expenses in the current date range and aren't already selected.
 */
import { useState } from 'react';
import { View } from 'react-native';
import {
  Chip,
  IconButton,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { CategoryAvatar } from './CategoryAvatar';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import { useCategoryLookup } from '../hooks/useCategoryLookup';

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
  const lookup = useCategoryLookup();
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
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 6,
          }}
        >
          {includeIds.map((id) => {
            const r = lookup.resolve(id);
            // Custom inline chip instead of RN Paper's `Chip` for selected
            // filters: Paper's `Chip` positions its close button with
            // `position: 'absolute'` under a column-flex Surface, which
            // interacts badly with our wrapping parent and renders the X
            // below the pill. Laying out [avatar][label][×] in a single
            // flex row sidesteps that entire absolute-positioning path.
            return (
              <TouchableRipple
                key={`inc-${id}`}
                onPress={() => onRemoveInclude(id)}
                borderless
                accessibilityRole="button"
                accessibilityLabel={translate('transactions.removeFilter', {
                  name: r.name,
                })}
                style={{
                  backgroundColor: theme.colors.secondaryContainer,
                  borderRadius: 16,
                  paddingLeft: 4,
                  paddingRight: 8,
                  paddingVertical: 4,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <CategoryAvatar iconName={r.iconName} color={r.color} size={24} />
                  <Text
                    variant="labelLarge"
                    style={{ color: theme.colors.onSecondaryContainer }}
                  >
                    {r.name}
                  </Text>
                  <MaterialIcons
                    name="close"
                    size={16}
                    color={theme.colors.onSecondaryContainer}
                  />
                </View>
              </TouchableRipple>
            );
          })}
          {availableCategoryIds.size > 0 && (
            <Chip
              icon="plus"
              onPress={() => setPickerOpen(true)}
              mode="outlined"
            >
              {translate('transactions.add')}
            </Chip>
          )}
        </View>
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
