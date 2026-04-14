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
import { useExpenses } from '../hooks/useExpenses.ts';
import { useExchangeRates } from '../hooks/useExchangeRates.ts';
import { getCategoryConfig } from '../utils/categoryConfig.ts';
import { formatAmountWithCurrency } from '../utils/format.ts';

export default function TransactionsPage() {
  const { expenses, loading, error } = useExpenses();
  const { convert, mainCurrency } = useExchangeRates();

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

  // Sort by date descending
  const sorted = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <Box sx={{ py: 2 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2, px: 1 }}>
        Transactions
      </Typography>

      {sorted.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
          No transactions yet.
        </Typography>
      )}

      <List disablePadding>
        {sorted.map((expense) => {
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
}
