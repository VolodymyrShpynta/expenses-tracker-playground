import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { formatAmountWithCurrency } from '../../utils/format';
import type { GroupBy } from './groupExpenses';

/**
 * Sticky-style header above each group of transactions. The `day`
 * variant gets a richer two-line layout (large day-of-month + weekday/
 * month) because day groups are the densest view; coarser groups fall
 * back to a single-line label.
 */
interface ExpenseGroupHeaderProps {
  date: Date;
  label: string;
  groupBy: GroupBy;
  groupTotal: number;
  mainCurrency: string;
}

export function ExpenseGroupHeader({
  date,
  label,
  groupBy,
  groupTotal,
  mainCurrency,
}: ExpenseGroupHeaderProps) {
  const { i18n } = useTranslation();
  return (
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
            {date.getDate().toString().padStart(2, '0')}
          </Typography>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', lineHeight: 1.3 }}
            >
              {date.toLocaleDateString(i18n.language, { weekday: 'long' }).toUpperCase()}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
              sx={{ lineHeight: 1.3 }}
            >
              {date.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }).toUpperCase()}
            </Typography>
          </Box>
        </Box>
      ) : (
        <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
      )}
      <Typography variant="body2" fontWeight={600} color="primary">
        {formatAmountWithCurrency(groupTotal, mainCurrency)}
      </Typography>
    </Box>
  );
}
