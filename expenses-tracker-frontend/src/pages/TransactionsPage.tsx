import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
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
import EditIcon from '@mui/icons-material/Edit';
import { CategoryAutocomplete } from '../components/CategoryAutocomplete.tsx';
import { useExpenses } from '../hooks/useExpenses.ts';
import { useExchangeRates } from '../hooks/useExchangeRates.ts';
import { getCategoryConfig } from '../utils/categoryConfig.ts';
import { formatAmountWithCurrency } from '../utils/format.ts';
import { SpendingDateHeader } from '../components/SpendingDateHeader.tsx';
import { useDateRange } from '../hooks/useDateRange.ts';
import type { PresetKey } from '../utils/dateRange.ts';
import type { Expense } from '../types/expense.ts';
import { EditExpenseDialog } from '../components/EditExpenseDialog.tsx';

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
  switch (groupBy) {
    case 'day': {
      const day = date.getDate().toString().padStart(2, '0');
      const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      const month = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      return `${day}  ${weekday}\n${month}`;
    }
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
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
  const { expenses, loading, error } = useExpenses();
  const { convert, mainCurrency } = useExchangeRates();
  const { dateRange, preset } = useDateRange();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const groupBy = useMemo(() => presetToGroupBy(preset), [preset]);

  const addCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => new Set(prev).add(category));
  }, []);

  const removeCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      next.delete(category);
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
        if (selectedCategories.size > 0 && !selectedCategories.has(e.category)) return false;
        if (query && !e.description.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, dateRange, searchQuery, selectedCategories]);

  // Unique categories present in date-filtered expenses (for filter chips)
  const availableCategories = useMemo(() => {
    const fromTime = dateRange.from.getTime();
    const toTime = dateRange.to.getTime();
    const cats = new Set<string>();
    for (const e of expenses) {
      const t = new Date(e.date).getTime();
      if (t >= fromTime && t <= toTime) cats.add(e.category);
    }
    return Array.from(cats).sort();
  }, [expenses, dateRange]);

  // Categories not yet selected (for the dropdown menu)
  const unselectedCategories = useMemo(
    () => availableCategories.filter((c) => !selectedCategories.has(c)),
    [availableCategories, selectedCategories],
  );

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
            onClick={() => setFilterOpen((prev) => !prev)}
            disabled={unselectedCategories.length === 0}
            aria-label="Filter by category"
          >
            <FilterListIcon />
          </IconButton>
          <TextField
            size="small"
            fullWidth
            placeholder="Search by description…"
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
        {filterOpen && unselectedCategories.length > 0 && (
          <CategoryAutocomplete
            open
            size="small"
            options={unselectedCategories}
            value={null}
            onChange={(val) => { if (val) { addCategory(val); setFilterOpen(unselectedCategories.length > 1); } }}
            placeholder="Search categories…"
            fullWidth
            autoFocus
            blurOnSelect
            onClose={() => setFilterOpen(false)}
            sx={{ mt: 1 }}
          />
        )}
        {selectedCategories.size > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {Array.from(selectedCategories).map((cat) => {
              const config = getCategoryConfig(cat);
              return (
                <Chip
                  key={cat}
                  label={cat}
                  size="small"
                  onDelete={() => removeCategory(cat)}
                  onClick={() => removeCategory(cat)}
                  sx={{ bgcolor: config.color, color: '#fff' }}
                />
              );
            })}
          </Box>
        )}
      </Box>

      {sorted.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
          No transactions yet.
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
                      {group.date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                      {group.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
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
                const config = getCategoryConfig(expense.category);
                const Icon = config.icon;
                const dateStr = new Date(expense.date).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });

                return (
                  <Box key={expense.id}>
                    <ListItem
                      sx={{ px: 1 }}
                      secondaryAction={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="body2" fontWeight={600}>
                              {formatAmountWithCurrency(convert(expense.amount, expense.currency), mainCurrency)}
                            </Typography>
                            {expense.currency !== mainCurrency && (
                              <Typography variant="caption" color="text.secondary">
                                {formatAmountWithCurrency(expense.amount, expense.currency)}
                              </Typography>
                            )}
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => setEditingExpense(expense)}
                            aria-label="Edit expense"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      }
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Icon sx={{ color: config.color }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={expense.description}
                        secondary={
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                            <Chip label={expense.category} size="small" variant="outlined" />
                            <Typography variant="caption" color="text.secondary">
                              {dateStr}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    <Divider variant="inset" component="li" />
                  </Box>
                );
              })}
            </List>
          </Box>
        );
      })}

      {editingExpense && (
        <EditExpenseDialog
          key={editingExpense.id}
          expense={editingExpense}
          open
          onClose={() => setEditingExpense(null)}
        />
      )}
    </Box>
  );
}
