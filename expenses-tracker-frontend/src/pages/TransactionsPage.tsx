import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useTranslation } from 'react-i18next';
import { CategoryPickerDialog } from '../components/CategoryPickerDialog.tsx';
import { useExpenses } from '../hooks/useExpenses.ts';
import { useExchangeRates } from '../hooks/useExchangeRates.ts';
import { useCategoryLookup } from '../hooks/useCategoryLookup.ts';
import { formatAmountWithCurrency } from '../utils/format.ts';
import { SpendingDateHeader } from '../components/SpendingDateHeader.tsx';
import { useDateRange } from '../hooks/useDateRange.ts';
import type { PresetKey } from '../utils/dateRange.ts';
import type { Expense } from '../types/expense.ts';
import { AddExpenseDialog } from '../components/AddExpenseDialog.tsx';
import { getLocale } from '../i18n/locale.ts';

type GroupBy = 'day' | 'month' | 'year';

function presetToGroupBy(preset: PresetKey): GroupBy {
  switch (preset) {
    case 'year': return 'month';
    case 'all': return 'year';
    default: return 'day';
  }
}

function groupKey(date: Date, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'day': return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    case 'month': return `${date.getFullYear()}-${date.getMonth()}`;
    case 'year': return `${date.getFullYear()}`;
  }
}

function groupLabel(date: Date, groupBy: GroupBy): string {
  const locale = getLocale();
  switch (groupBy) {
    case 'day': {
      const day = date.getDate().toString().padStart(2, '0');
      const weekday = date.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
      const month = date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();
      return `${day}  ${weekday}\n${month}`;
    }
    case 'month':
      return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();
    case 'year':
      return `${date.getFullYear()}`;
  }
}

interface ExpenseGroup {
  key: string;
  label: string;
  date: Date;
  expenses: Expense[];
}

export default function TransactionsPage() {
  const { t: translate, i18n } = useTranslation();
  const { expenses, loading, error } = useExpenses();
  const { convert, mainCurrency } = useExchangeRates();
  const { dateRange, preset } = useDateRange();
  const categoryLookup = useCategoryLookup();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => {
    const cat = searchParams.get('categoryId');
    return cat ? new Set([cat]) : new Set();
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const groupBy = useMemo(() => presetToGroupBy(preset), [preset]);

  const addCategory = useCallback((categoryId: string) => {
    setSelectedCategories((prev) => new Set(prev).add(categoryId));
  }, []);

  const removeCategory = useCallback((categoryId: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      next.delete(categoryId);
      return next;
    });
  }, []);

  // Filter by date range, then sort by date descending
  const sorted = useMemo(() => {
    const fromTime = dateRange.from.getTime();
    const toTime = dateRange.to.getTime();
    const query = searchQuery.toLowerCase().trim();
    return [...expenses]
      .filter((e) => {
        const t = new Date(e.date).getTime();
        if (t < fromTime || t > toTime) return false;
        if (selectedCategories.size > 0 && !selectedCategories.has(e.categoryId)) return false;
        if (query && !e.description.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, dateRange, searchQuery, selectedCategories]);

  // Unique category ids present in date-filtered expenses (for filter chips)
  const availableCategories = useMemo(() => {
    const fromTime = dateRange.from.getTime();
    const toTime = dateRange.to.getTime();
    const cats = new Set<string>();
    for (const e of expenses) {
      const t = new Date(e.date).getTime();
      if (t >= fromTime && t <= toTime) cats.add(e.categoryId);
    }
    return cats;
  }, [expenses, dateRange]);

  // Categories not yet selected (available to pick in the dialog)
  const unselectedCategories = useMemo(() => {
    const next = new Set<string>();
    availableCategories.forEach((c) => {
      if (!selectedCategories.has(c)) next.add(c);
    });
    return next;
  }, [availableCategories, selectedCategories]);

  const totalSpending = useMemo(
    () => sorted.reduce((sum, e) => sum + convert(e.amount, e.currency), 0),
    [sorted, convert],
  );

  const groups = useMemo((): ExpenseGroup[] => {
    const map = new Map<string, ExpenseGroup>();
    for (const expense of sorted) {
      const date = new Date(expense.date);
      const key = groupKey(date, groupBy);
      let group = map.get(key);
      if (!group) {
        group = { key, label: groupLabel(date, groupBy), date, expenses: [] };
        map.set(key, group);
      }
      group.expenses.push(expense);
    }
    return Array.from(map.values());
  }, [sorted, groupBy]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 2, mx: 1 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 2 }}>
      <SpendingDateHeader
        totalSpending={totalSpending}
        currency={mainCurrency}
      />

      {/* Search & category filters */}
      <Box sx={{ px: 1, mt: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <IconButton
            onClick={(e) => {
              // Blur before the Dialog applies aria-hidden to #root, otherwise
              // the focused button becomes an aria-hidden descendant (a11y violation).
              e.currentTarget.blur();
              setFilterOpen(true);
            }}
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
            onChange={(e) => setSearchQuery(e.target.value)}
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
          onClose={() => setFilterOpen(false)}
          selected=""
          onSelect={(id) => {
            addCategory(id);
            setFilterOpen(false);
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
                  onDelete={() => removeCategory(catId)}
                  onClick={() => removeCategory(catId)}
                  sx={{ bgcolor: resolved.color, color: '#fff' }}
                />
              );
            })}
          </Box>
        )}
      </Box>

      {sorted.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
          {translate('expenses.noTransactions')}
        </Typography>
      )}

      {groups.map((group) => {
        const groupTotal = group.expenses.reduce(
          (sum, e) => sum + convert(e.amount, e.currency), 0,
        );

        return (
          <Box key={group.key}>
            {/* Group header */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                px: 1,
                pt: 3,
                pb: 0.5,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              {groupBy === 'day' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="h4" fontWeight={300} sx={{ lineHeight: 1, fontSize: '2.2rem' }}>
                    {group.date.getDate().toString().padStart(2, '0')}
                  </Typography>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                      {group.date.toLocaleDateString(i18n.language, { weekday: 'long' }).toUpperCase()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                      {group.date.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }).toUpperCase()}
                    </Typography>
                  </Box>
                </Box>
              ) : (                <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                  {group.label}
                </Typography>
              )}
              <Typography variant="body2" fontWeight={600} color="primary">
                {formatAmountWithCurrency(groupTotal, mainCurrency)}
              </Typography>
            </Box>

            {/* Group transactions */}
            <List disablePadding>
              {group.expenses.map((expense) => {
                const resolved = categoryLookup.resolve(expense.categoryId);
                const Icon = resolved.icon;
                const categoryName = resolved.name;
                const dateStr = new Date(expense.date).toLocaleDateString(i18n.language, {
                  day: 'numeric',
                  month: 'short',
                });

                return (
                  <Box key={expense.id}>
                    <ListItemButton
                      sx={{ px: 1 }}
                      onClick={() => setEditingExpense(expense)}
                      aria-label={translate('expenses.editExpenseAriaLabel', { description: expense.description })}
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Icon sx={{ color: resolved.color }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={expense.description}
                        slotProps={{ secondary: { component: 'div' } }}
                        secondary={
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                            <Chip label={categoryName || translate('categoryDialog.defaultCategoryLabel')} size="small" variant="outlined" />
                            <Typography variant="caption" color="text.secondary" component="span">
                              {dateStr}
                            </Typography>
                          </Box>
                        }
                      />
                      <Box sx={{ textAlign: 'right', ml: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {formatAmountWithCurrency(convert(expense.amount, expense.currency), mainCurrency)}
                        </Typography>
                        {expense.currency !== mainCurrency && (
                          <Typography variant="caption" color="text.secondary">
                            {formatAmountWithCurrency(expense.amount, expense.currency)}
                          </Typography>
                        )}
                      </Box>
                    </ListItemButton>
                    <Divider variant="inset" component="li" />
                  </Box>
                );
              })}
            </List>
          </Box>
        );
      })}

      {editingExpense && (
        <AddExpenseDialog
          key={editingExpense.id}
          expense={editingExpense}
          open
          onClose={() => setEditingExpense(null)}
        />
      )}
    </Box>
  );
}
