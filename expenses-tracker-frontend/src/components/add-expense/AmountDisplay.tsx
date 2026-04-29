import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Centered "currency + calculator expression" amount readout used as the
 * primary visual focus of the AddExpenseDialog. Falls back to '0' while
 * the expression is empty so the layout never collapses.
 */
interface AmountDisplayProps {
  label: string;
  currency: string;
  /** Raw calculator expression, e.g. "2 + 3 × 4". Empty string renders as '0'. */
  expression: string;
  color: string;
}

/** Centered "currency + calculator expression" amount readout. */
export function AmountDisplay({
  label,
  currency,
  expression,
  color,
}: AmountDisplayProps) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="caption" sx={{ color, letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography
        component="div"
        sx={{
          color,
          fontSize: { xs: '1.75rem', sm: '2rem' },
          fontWeight: 400,
          lineHeight: 1.2,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
          gap: 1,
          minHeight: { xs: 36, sm: 44 },
        }}
      >
        <Box component="span" sx={{ fontSize: '1rem', fontWeight: 500, opacity: 0.9 }}>
          {currency}
        </Box>
        <Box component="span">{expression || '0'}</Box>
      </Typography>
    </Box>
  );
}
