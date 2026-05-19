/**
 * Overview-screen filter control. Owns the conditional UI that swaps
 * between an empty-state icon (no categories selected) and the
 * chip-row `CategoryIncludeFilter` (one or more selected), plus the
 * picker dialog the empty-state icon opens.
 *
 * Pulled out of the Overview screen so the parent doesn't need a
 * separate `useState` for the empty-state picker visibility — that
 * concern lives here.
 */
import { useState } from 'react';
import { IconButton } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { CategoryIncludeFilter } from './CategoryIncludeFilter';
import { CategoryPickerDialog } from './CategoryPickerDialog';

export interface OverviewCategoryFilterProps {
  readonly selectedCategoryIds: ReadonlyArray<string>;
  readonly availableCategoryIds: ReadonlySet<string>;
  readonly onAddInclude: (id: string) => void;
  readonly onRemoveInclude: (id: string) => void;
}

export function OverviewCategoryFilter({
  selectedCategoryIds,
  availableCategoryIds,
  onAddInclude,
  onRemoveInclude,
}: OverviewCategoryFilterProps) {
  const { t: translate } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Selection present → full chip-row filter; it manages its own picker
  // through the "+ Add" pill, so we don't need a dialog here.
  if (selectedCategoryIds.length > 0) {
    return (
      <CategoryIncludeFilter
        includeIds={selectedCategoryIds}
        availableCategoryIds={availableCategoryIds}
        onAddInclude={onAddInclude}
        onRemoveInclude={onRemoveInclude}
        addLabel={translate('transactions.add')}
      />
    );
  }

  // Empty state: nothing to filter by → render nothing so the row
  // collapses (saves vertical space on screens with no expenses yet).
  if (availableCategoryIds.size === 0) return null;

  // Empty state with categories available: a single right-aligned
  // filter icon. Tapping opens the same picker the "+ Add" pill would.
  // Mirrors the Transactions screen's filter-icon affordance.
  return (
    <>
      <IconButton
        icon="filter-variant"
        size={20}
        onPress={() => setPickerOpen(true)}
        accessibilityLabel={translate('expenses.filterByCategory')}
        style={{ margin: 0, alignSelf: 'flex-end' }}
      />
      <CategoryPickerDialog
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        availableIds={availableCategoryIds}
        onPick={(id) => {
          onAddInclude(id);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
