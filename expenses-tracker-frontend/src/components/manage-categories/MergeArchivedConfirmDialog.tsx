import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { Trans, useTranslation } from 'react-i18next';

interface MergeArchivedConfirmDialogProps {
  /** Display name of the active row that will absorb its archived twins. */
  name: string;
  /** How many archived siblings will be merged. */
  count: number;
  pending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * "Absorb archived twins" confirmation: collapses every soft-deleted
 * same-named row into the active row in one click.
 */
export function MergeArchivedConfirmDialog({
  name,
  count,
  pending,
  errorMessage,
  onCancel,
  onConfirm,
}: MergeArchivedConfirmDialogProps) {
  const { t: translate } = useTranslation();
  return (
    <Dialog open onClose={onCancel} maxWidth="xs">
      <DialogTitle>{translate('categoryDialog.mergeArchivedTitle')}</DialogTitle>
      <DialogContent>
        <Typography>
          <Trans
            i18nKey="categoryDialog.mergeArchivedConfirm"
            values={{ count, name }}
            components={{ 1: <strong /> }}
          />
        </Typography>
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
        <Button variant="contained" onClick={onConfirm} disabled={pending}>
          {pending
            ? translate('common.saving')
            : translate('categoryDialog.mergeArchivedButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
