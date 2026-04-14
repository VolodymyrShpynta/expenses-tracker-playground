import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useExpenses } from '../hooks/useExpenses.ts';
import { useConvertedExpenses } from '../hooks/useExchangeRates.ts';
import { useCategorySummary } from '../hooks/useCategorySummary.ts';
import { CategoryCard } from '../components/CategoryCard.tsx';
import { CategoryDonutChart } from '../components/CategoryDonutChart.tsx';
import { DateRangeSelector } from '../components/DateRangeSelector.tsx';
import { formatAmountWithCurrency } from '../utils/format.ts';
import { useMainCurrency } from '../hooks/useCurrency.ts';

export default function CategoriesPage() {
  const { expenses, loading, error } = useExpenses();
  const convertedExpenses = useConvertedExpenses(expenses);
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  });
  const { categories, grandTotal } = useCategorySummary(convertedExpenses, dateRange);
  const { mainCurrency } = useMainCurrency();
  const theme = useTheme();
  const isLarge = useMediaQuery(theme.breakpoints.up('md'));

  // Responsive layout: how many categories go in each zone around the donut
  const topCount = isLarge ? 6 : 4;
  // On desktop: 2 columns per side × 3 rows = 6 per side; mobile: 1 col × 2 rows = 2 per side
  const sideCols = isLarge ? 2 : 1;
  const sideRows = isLarge ? 3 : 2;
  const sideCount = sideCols * sideRows;
  const aroundTotal = topCount + sideCount * 2;

  const { topCats, leftCats, rightCats, bottomCats } = useMemo(() => {
    const top = categories.slice(0, topCount);
    const left = categories.slice(topCount, topCount + sideCount);
    const right = categories.slice(topCount + sideCount, aroundTotal);
    const bottom = categories.slice(aroundTotal);
    return { topCats: top, leftCats: left, rightCats: right, bottomCats: bottom };
  }, [categories, topCount, sideCount, aroundTotal]);

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

  const donutSize = isLarge ? 300 : 240;

  return (
    <Box sx={{ py: 2 }}>
      {/* Total header */}
      <Box sx={{ textAlign: 'center', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Total spending
        </Typography>
        <Typography variant="h4" fontWeight={700}>
          {formatAmountWithCurrency(grandTotal, mainCurrency)}
        </Typography>
      </Box>

      {/* Date range */}
      <DateRangeSelector value={dateRange} onChange={setDateRange} />

      {/* Top categories row */}
      {topCats.length > 0 && (
        <Grid container spacing={1} sx={{ mt: 1 }}>
          {topCats.map((cat) => (
            <Grid key={cat.category} size={{ xs: 12 / topCount, md: 12 / topCount }}>
              <CategoryCard summary={cat} currency={mainCurrency} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Donut chart with side categories */}
      {categories.length > 0 && (
        <Grid container spacing={1} sx={{ mt: 2, mb: 2, alignItems: 'center' }}>
          {/* Left side categories — 1 col on mobile, 2 cols on desktop */}
          <Grid size={{ xs: 12 / topCount, md: (12 / topCount) * sideCols }}>
            <Grid container spacing={1}>
              {leftCats.map((cat) => (
                <Grid key={cat.category} size={{ xs: 12, md: 12 / sideCols }}>
                  <CategoryCard summary={cat} currency={mainCurrency} />
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* Donut chart — takes the remaining center columns */}
          <Grid size={{ xs: 12 - (24 / topCount), md: 12 - ((24 / topCount) * sideCols) }}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <CategoryDonutChart
                categories={categories}
                grandTotal={grandTotal}
                size={donutSize}
                currency={mainCurrency}
              />
            </Box>
          </Grid>

          {/* Right side categories — 1 col on mobile, 2 cols on desktop */}
          <Grid size={{ xs: 12 / topCount, md: (12 / topCount) * sideCols }}>
            <Grid container spacing={1}>
              {rightCats.map((cat) => (
                <Grid key={cat.category} size={{ xs: 12, md: 12 / sideCols }}>
                  <CategoryCard summary={cat} currency={mainCurrency} />
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      )}

      {/* Remaining categories grid */}
      {bottomCats.length > 0 && (
        <Grid container spacing={1}>
          {bottomCats.map((cat) => (
            <Grid key={cat.category} size={{ xs: 3, sm: 3, md: 2 }}>
              <CategoryCard summary={cat} currency={mainCurrency} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty state */}
      {categories.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="h6" color="text.secondary">
            No expenses yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Tap the + button to add your first expense.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
