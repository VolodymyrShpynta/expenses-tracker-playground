import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useTranslation } from 'react-i18next';

/**
 * Confirmation dialog for the destructive "reset categories to defaults"
 * action. Backend re-seeds the templated catalog and archives any custom
 * rows; user expenses are preserved.
 */
interface ResetCategoriesConfirmDialogProps {
  pending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetCategoriesConfirmDialog({
  pending,
  errorMessage,
  onCancel,
  onConfirm,
}: ResetCategoriesConfirmDialogProps) {
  const { t: translate } = useTranslation();
  return (
    <Dialog open onClose={onCancel} maxWidth="xs">
      <DialogTitle>{translate('categoryDialog.resetTitle')}</DialogTitle>
      <DialogContent>
        <Typography>{translate('categoryDialog.resetConfirm')}</Typography>
        {errorMessage && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          {translate('common.cancel')}
        </Button>
        <Button color="warning" variant="contained" onClick={onConfirm} disabled={pending}>
          {pending ? translate('common.saving') : translate('categoryDialog.resetConfirmButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
