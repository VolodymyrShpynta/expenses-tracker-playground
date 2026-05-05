import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { useTranslation } from 'react-i18next';
import { useExpenses } from '../hooks/useExpenses';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import { SpendingDateHeader } from '../components/SpendingDateHeader';
import { useDateRange } from '../hooks/useDateRange';
import type { Expense } from '../types/expense';
import { AddExpenseDialog } from '../components/AddExpenseDialog';
import { useMainCurrency } from '../hooks/useCurrency';
import {
  groupExpenses,
  presetToGroupBy,
} from '../components/transactions/groupExpenses';
import { TransactionFilters } from '../components/transactions/TransactionFilters';
import { ExpenseGroupHeader } from '../components/transactions/ExpenseGroupHeader';
import { ExpenseRow } from '../components/transactions/ExpenseRow';

export default function TransactionsPage() {
  const { t: translate } = useTranslation();
  const { expenses, loading, error } = useExpenses();
  const { convert } = useExchangeRates();
  const { mainCurrency } = useMainCurrency();
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

  const groups = useMemo(() => groupExpenses(sorted, groupBy), [sorted, groupBy]);

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
      <SpendingDateHeader totalSpending={totalSpending} currency={mainCurrency} />

      <TransactionFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategories={selectedCategories}
        unselectedCategories={unselectedCategories}
        filterOpen={filterOpen}
        onOpenFilter={(e) => {
          // Blur before the Dialog applies aria-hidden to #root, otherwise
          // the focused button becomes an aria-hidden descendant (a11y violation).
          e.currentTarget.blur();
          setFilterOpen(true);
        }}
        onCloseFilter={() => setFilterOpen(false)}
        onAddCategory={addCategory}
        onRemoveCategory={removeCategory}
        categoryLookup={categoryLookup}
      />

      {sorted.length === 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: 'center', mt: 4 }}
        >
          {translate('expenses.noTransactions')}
        </Typography>
      )}

      {groups.map((group) => {
        const groupTotal = group.expenses.reduce(
          (sum, e) => sum + convert(e.amount, e.currency),
          0,
        );
        return (
          <Box key={group.key}>
            <ExpenseGroupHeader
              date={group.date}
              label={group.label}
              groupBy={groupBy}
              groupTotal={groupTotal}
              mainCurrency={mainCurrency}
            />
            <List disablePadding>
              {group.expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  categoryLookup={categoryLookup}
                  mainCurrency={mainCurrency}
                  convertedAmount={convert(expense.amount, expense.currency)}
                  onEdit={setEditingExpense}
                />
              ))}
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
