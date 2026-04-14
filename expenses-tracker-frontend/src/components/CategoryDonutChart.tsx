import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { PieChart } from '@mui/x-charts/PieChart';
import type { CategorySummary } from '../types/expense.ts';
import { getCategoryColor } from '../utils/categoryConfig.ts';
import { formatAmountCompact } from '../utils/format.ts';

interface CategoryDonutChartProps {
  categories: CategorySummary[];
  grandTotal: number;
  /** Chart outer size in px (defaults to 260) */
  size?: number;
}

export function CategoryDonutChart({
  categories,
  grandTotal,
  size = 260,
}: CategoryDonutChartProps) {
  const theme = useTheme();

  const filtered = categories.filter((c) => c.total > 0);

  // Show a single grey ring when there are no expenses
  const data = filtered.length > 0
    ? filtered.map((c) => ({
        id: c.category,
        value: c.total,
        label: c.category,
        color: getCategoryColor(c.category),
      }))
    : [{ id: 'empty', value: 1, label: 'No expenses', color: theme.palette.action.disabledBackground }];

  return (
    <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
      <PieChart
        series={[
          {
            data,
            innerRadius: size * 0.32,
            outerRadius: size * 0.46,
            paddingAngle: 1,
            cornerRadius: 3,
          },
        ]}
        width={size}
        height={size}
        hideLegend
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />

      {/* Center label */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Expenses
        </Typography>
        <Typography
          variant="h5"
          fontWeight={700}
          sx={{ color: theme.palette.error.main }}
        >
          {formatAmountCompact(grandTotal)}
        </Typography>
      </Box>
    </Box>
  );
}
