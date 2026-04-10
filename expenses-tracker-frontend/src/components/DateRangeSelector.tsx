import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useCallback } from 'react';

interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function formatRange(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const from = range.from.toLocaleDateString('en-US', opts).toUpperCase();
  const to = range.to.toLocaleDateString('en-US', opts).toUpperCase();
  return `${from} – ${to}`;
}

/**
 * Simple month-based date range navigator.
 * Arrows shift the window by one month at a time.
 */
export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const shift = useCallback(
    (direction: -1 | 1) => {
      const from = new Date(value.from);
      const to = new Date(value.to);
      from.setMonth(from.getMonth() + direction);
      to.setMonth(to.getMonth() + direction);
      onChange({ from, to });
    },
    [value, onChange],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 1,
      }}
    >
      <IconButton size="small" onClick={() => shift(-1)} aria-label="Previous period">
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="body2" fontWeight={500} sx={{ minWidth: 200, textAlign: 'center' }}>
        {formatRange(value)}
      </Typography>
      <IconButton size="small" onClick={() => shift(1)} aria-label="Next period">
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
}

/**
 * Returns a default "last 12 months" range.
 */
export function defaultDateRange(): DateRange {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0); // end of current month
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  from.setDate(1); // start of that month
  return { from, to };
}
