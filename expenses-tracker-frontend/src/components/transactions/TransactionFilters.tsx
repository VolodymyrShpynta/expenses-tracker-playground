import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useTranslation } from 'react-i18next';
import type { MouseEvent } from 'react';
import { CategoryPickerDialog } from '../CategoryPickerDialog.tsx';
import type { CategoryLookup } from '../../hooks/useCategoryLookup.ts';

/**
 * Filter bar for the transactions list: search-by-description plus a
 * multi-select category picker rendered as deletable chips. Stateless —
 * the parent page owns the selected/unselected category sets.
 */
interface TransactionFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;

  selectedCategories: Set<string>;
  unselectedCategories: Set<string>;

  filterOpen: boolean;
  onOpenFilter: (e: MouseEvent<HTMLElement>) => void;
  onCloseFilter: () => void;
  onAddCategory: (id: string) => void;
  onRemoveCategory: (id: string) => void;

  categoryLookup: CategoryLookup;
}

export function TransactionFilters({
  searchQuery,
  onSearchChange,
  selectedCategories,
  unselectedCategories,
  filterOpen,
  onOpenFilter,
  onCloseFilter,
  onAddCategory,
  onRemoveCategory,
  categoryLookup,
}: TransactionFiltersProps) {
  const { t: translate } = useTranslation();
  return (
    <Box sx={{ px: 1, mt: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <IconButton
          onClick={onOpenFilter}
          disabled={unselectedCategories.size === 0}
          aria-label={translate('expenses.filterByCategory')}
        >
          <FilterListIcon />
        </IconButton>
        <TextField
          size="small"
          fullWidth
          placeholder={translate('expenses.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <CategoryPickerDialog
        open={filterOpen}
        onClose={onCloseFilter}
        selected=""
        onSelect={(id) => {
          onAddCategory(id);
          onCloseFilter();
        }}
        availableIds={unselectedCategories}
        title={translate('categoryDialog.filterTitle')}
      />

      {selectedCategories.size > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {Array.from(selectedCategories).map((catId) => {
            const resolved = categoryLookup.resolve(catId);
            const label = resolved.name || translate('categoryDialog.defaultCategoryLabel');
            return (
              <Chip
                key={catId}
                label={label}
                size="small"
                onDelete={() => onRemoveCategory(catId)}
                onClick={() => onRemoveCategory(catId)}
                sx={(theme) => ({
                  bgcolor: resolved.color,
                  color: theme.palette.getContrastText(resolved.color),
                })}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}
