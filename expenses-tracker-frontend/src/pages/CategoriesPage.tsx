import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddIcon from '@mui/icons-material/Add';
import IconButton from '@mui/material/IconButton';
import { useTranslation } from 'react-i18next';
import { useExpenses } from '../hooks/useExpenses.ts';
import { useConvertedExpenses } from '../hooks/useExchangeRates.ts';
import { useCategorySummary } from '../hooks/useCategorySummary.ts';
import { useCategoryLookup } from '../hooks/useCategoryLookup.ts';
import { CategoryDonutChart } from '../components/CategoryDonutChart.tsx';
import { SpendingDateHeader } from '../components/SpendingDateHeader.tsx';
import { useMainCurrency } from '../hooks/useCurrency.ts';
import { useDateRange } from '../hooks/useDateRange.ts';
import { formatAmountCompactWithCurrency } from '../utils/format.ts';
import { AddExpenseDialog } from '../components/AddExpenseDialog.tsx';

export default function CategoriesPage() {
  const { t: translate } = useTranslation();
  const { expenses, loading, error } = useExpenses();
  const convertedExpenses = useConvertedExpenses(expenses);
  const { dateRange } = useDateRange();
  const categoryLookup = useCategoryLookup();
  const { categories, grandTotal } = useCategorySummary(convertedExpenses, dateRange);
  const { mainCurrency } = useMainCurrency();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [addCategoryId, setAddCategoryId] = useState<string | null>(null);

  // Categories with spending, sorted descending by amount (from useCategorySummary)
  const activeCategories = useMemo(
    () => categories.filter((c) => c.total > 0),
    [categories],
  );

  const handleCategoryClick = (categoryId: string) => {
    void navigate(`/transactions?categoryId=${encodeURIComponent(categoryId)}`);
  };

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
        totalSpending={grandTotal}
        currency={mainCurrency}
      />

      {/* Donut chart — centered */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 2 }}>
        <CategoryDonutChart
          categories={activeCategories}
          grandTotal={grandTotal}
          categoryLookup={categoryLookup}
          size={isDesktop ? 320 : 240}
          currency={mainCurrency}
        />
      </Box>

      {/* Category legend list — sorted by spending (matches chart) */}
      <Box sx={{ mt: 1, px: 1 }}>
        {activeCategories.map((cat, idx) => {
          const resolved = categoryLookup.resolve(cat.categoryId);
          const Icon = resolved.icon;
          const isDark = theme.palette.mode === 'dark';
          const pct = Math.round(cat.percentage);
          return (
            <Box key={cat.categoryId}>
              {idx > 0 && <Divider sx={{ opacity: 0.15 }} />}
              <Box
                onClick={() => handleCategoryClick(cat.categoryId)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  py: 1.5,
                  px: 1,
                  borderRadius: 1,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                  '&:hover': {
                    backgroundColor: alpha(resolved.color, 0.08),
                  },
                }}
              >
                {/* Icon */}
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: alpha(resolved.color, isDark ? 0.25 : 0.15),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon sx={{ fontSize: 22, color: resolved.color }} />
                </Box>

                {/* Name + percentage bar */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body1" fontWeight={500} noWrap>
                      {resolved.name}
                    </Typography>
                    <Typography variant="caption" fontWeight={600} sx={{ color: resolved.color, flexShrink: 0 }}>
                      {pct}%
                    </Typography>
                  </Box>
                  {/* Progress bar — full width of the text area */}
                  <Box
                    sx={{
                      width: '100%',
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: alpha(resolved.color, isDark ? 0.15 : 0.1),
                      overflow: 'hidden',
                      mt: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 3,
                        backgroundColor: resolved.color,
                      }}
                    />
                  </Box>
                </Box>

                {/* Amount */}
                <Typography
                  variant="body1"
                  fontWeight={700}
                  sx={{ color: resolved.color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                >
                  {mainCurrency
                    ? formatAmountCompactWithCurrency(cat.total, mainCurrency)
                    : String(Math.round(cat.total / 100))}
                </Typography>

                {/* Add expense button */}
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setAddCategoryId(cat.categoryId); }}
                  sx={{ color: 'text.disabled', flexShrink: 0 }}
                  aria-label={translate('expenses.addCategoryAriaLabel', { category: resolved.name })}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          );
        })}
      </Box>

      {addCategoryId !== null && (
        <AddExpenseDialog
          key={addCategoryId}
          open
          onClose={() => setAddCategoryId(null)}
          defaultCategoryId={addCategoryId}
        />
      )}

      {/* Empty state */}
      {categories.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="h6" color="text.secondary">
            {translate('expenses.noExpensesYet')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {translate('expenses.tapPlusHint')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
