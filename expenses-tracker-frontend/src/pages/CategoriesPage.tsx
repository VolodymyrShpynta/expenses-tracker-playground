import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import { useExpenses } from '../hooks/useExpenses.ts';
import { useCategorySummary } from '../hooks/useCategorySummary.ts';
import { CategoryCard } from '../components/CategoryCard.tsx';
import { CategoryDonutChart } from '../components/CategoryDonutChart.tsx';
import { DateRangeSelector, defaultDateRange } from '../components/DateRangeSelector.tsx';
import { formatAmount } from '../utils/format.ts';

export default function CategoriesPage() {
  const { expenses, loading, error } = useExpenses();
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const { categories, grandTotal } = useCategorySummary(expenses, dateRange);

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
      {/* Total header */}
      <Box sx={{ textAlign: 'center', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          All accounts
        </Typography>
        <Typography variant="h4" fontWeight={700}>
          {formatAmount(grandTotal)}
        </Typography>
      </Box>

      {/* Date range */}
      <DateRangeSelector value={dateRange} onChange={setDateRange} />

      {/* Top categories row */}
      <Grid container spacing={1} sx={{ mt: 1 }}>
        {categories.slice(0, 4).map((cat) => (
          <Grid key={cat.category} size={{ xs: 3, sm: 3, md: 2 }}>
            <CategoryCard summary={cat} />
          </Grid>
        ))}
      </Grid>

      {/* Donut chart */}
      {categories.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            mt: 2,
            mb: 2,
            py: 2,
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <CategoryDonutChart
            categories={categories}
            grandTotal={grandTotal}
            size={280}
          />
        </Paper>
      )}

      {/* Remaining categories grid */}
      {categories.length > 4 && (
        <Grid container spacing={1}>
          {categories.slice(4).map((cat) => (
            <Grid key={cat.category} size={{ xs: 3, sm: 3, md: 2 }}>
              <CategoryCard summary={cat} />
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
