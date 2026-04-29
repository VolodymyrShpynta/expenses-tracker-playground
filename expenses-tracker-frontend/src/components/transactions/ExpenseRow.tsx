import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTranslation } from 'react-i18next';
import type { Expense } from '../../types/expense.ts';
import type { CategoryLookup } from '../../hooks/useCategoryLookup.ts';
import { formatAmountWithCurrency } from '../../utils/format.ts';

/**
 * Single transaction row in the list. Tapping anywhere on the row opens
 * the edit dialog (parent owns the selected expense). When the row's
 * native currency differs from the user's main currency, both amounts
 * are shown stacked — converted on top, original below.
 */
interface ExpenseRowProps {
  expense: Expense;
  categoryLookup: CategoryLookup;
  mainCurrency: string;
  convertedAmount: number;
  onEdit: (expense: Expense) => void;
}

export function ExpenseRow({
  expense,
  categoryLookup,
  mainCurrency,
  convertedAmount,
  onEdit,
}: ExpenseRowProps) {
  const { t: translate, i18n } = useTranslation();
  const resolved = categoryLookup.resolve(expense.categoryId);
  const Icon = resolved.icon;
  const categoryName = resolved.name;
  const dateStr = new Date(expense.date).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });

  return (
    <Box>
      <ListItemButton
        sx={{ px: 1 }}
        onClick={() => onEdit(expense)}
        aria-label={translate('expenses.editExpenseAriaLabel', {
          description: expense.description,
        })}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>
          <Icon sx={{ color: resolved.color }} />
        </ListItemIcon>
        <ListItemText
          primary={expense.description}
          slotProps={{ secondary: { component: 'div' } }}
          secondary={
            <Box
              component="span"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}
            >
              <Chip
                label={categoryName || translate('categoryDialog.defaultCategoryLabel')}
                size="small"
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary" component="span">
                {dateStr}
              </Typography>
            </Box>
          }
        />
        <Box sx={{ textAlign: 'right', ml: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            {formatAmountWithCurrency(convertedAmount, mainCurrency)}
          </Typography>
          {expense.currency !== mainCurrency && (
            <Typography variant="caption" color="text.secondary">
              {formatAmountWithCurrency(expense.amount, expense.currency)}
            </Typography>
          )}
        </Box>
      </ListItemButton>
      <Divider variant="inset" component="li" />
    </Box>
  );
}
