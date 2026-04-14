import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import type { CategorySummary } from '../types/expense.ts';
import { getCategoryConfig } from '../utils/categoryConfig.ts';
import { formatAmountCompact } from '../utils/format.ts';

interface CategoryCardProps {
  summary: CategorySummary;
}

export function CategoryCard({ summary }: CategoryCardProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const config = getCategoryConfig(summary.category);
  const Icon = config.icon;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      onClick={() => void navigate(`/add?category=${encodeURIComponent(summary.category)}`)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        p: 1.5,
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        '&:hover': {
          backgroundColor: alpha(config.color, 0.08),
        },
      }}
    >
      {/* Category name */}
      <Typography
        variant="body2"
        fontWeight={500}
        noWrap
        sx={{ maxWidth: '100%', textAlign: 'center' }}
      >
        {summary.category}
      </Typography>

      {/* Icon circle */}
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: alpha(config.color, isDark ? 0.25 : 0.15),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon sx={{ fontSize: 28, color: config.color }} />
      </Box>

      {/* Amount */}
      <Typography
        variant="body2"
        fontWeight={700}
        sx={{ color: config.color }}
      >
        {formatAmountCompact(summary.total)}
      </Typography>
    </Box>
  );
}
