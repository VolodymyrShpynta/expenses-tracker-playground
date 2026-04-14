import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DateRangeSelector } from './DateRangeSelector.tsx';
import { formatAmountWithCurrency } from '../utils/format.ts';
import type { DateRange } from '../utils/dateRange.ts';
import type { CurrencyCode } from '../api/exchange.ts';

interface SpendingDateHeaderProps {
  totalSpending: number;
  currency: CurrencyCode;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

export function SpendingDateHeader({
  totalSpending,
  currency,
  dateRange,
  onDateRangeChange,
}: SpendingDateHeaderProps) {
  return (
    <>
      <Box sx={{ textAlign: 'center', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Total spending
        </Typography>
        <Typography variant="h4" fontWeight={700}>
          {formatAmountWithCurrency(totalSpending, currency)}
        </Typography>
      </Box>
      <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
    </>
  );
}
