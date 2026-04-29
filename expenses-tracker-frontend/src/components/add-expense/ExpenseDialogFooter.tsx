import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/**
 * Bottom row of the AddExpenseDialog. In create mode it is just the
 * formatted date; in edit mode it adds a two-step Delete affordance
 * (Delete → Confirm delete) so taps cannot accidentally destroy data.
 */
interface ExpenseDialogFooterProps {
  /** Localised "today, MMM D, YYYY" or "MMM D, YYYY" string. */
  dateLabel: string;
  /** When true, renders a Delete affordance with a two-step confirm. */
  showDelete: boolean;
  confirmDelete: boolean;
  pending: boolean;
  deletePending: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
}

export function ExpenseDialogFooter({
  dateLabel,
  showDelete,
  confirmDelete,
  pending,
  deletePending,
  onRequestDelete,
  onConfirmDelete,
}: ExpenseDialogFooterProps) {
  const { t: translate } = useTranslation();
  if (!showDelete) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {dateLabel}
      </Typography>
    );
  }
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        minHeight: 32,
      }}
    >
      {confirmDelete ? (
        <Button
          size="small"
          color="error"
          variant="contained"
          onClick={onConfirmDelete}
          disabled={pending}
        >
          {deletePending ? translate('common.deleting') : translate('common.confirmDelete')}
        </Button>
      ) : (
        <Button
          size="small"
          color="error"
          onClick={onRequestDelete}
          disabled={pending}
        >
          {translate('common.delete')}
        </Button>
      )}
      <Typography variant="body2" color="text.secondary">
        {dateLabel}
      </Typography>
    </Box>
  );
}
