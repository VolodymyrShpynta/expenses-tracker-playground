import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { Trans, useTranslation } from 'react-i18next';
import type { Category } from '../../types/category.ts';
import type { CategoryLookup } from '../../hooks/useCategoryLookup.ts';

/**
 * Step 2 of the manual merge flow: confirm migrating every expense from
 * `source` into `target`, then soft-delete `source`. Surfaces a warning
 * when merging a templated row into a custom one (loses translation +
 * "reset to defaults" coverage).
 */
interface MergeCategoriesConfirmDialogProps {
  source: Category;
  target: Category;
  categoryLookup: CategoryLookup;
  pending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MergeCategoriesConfirmDialog({
  source,
  target,
  categoryLookup,
  pending,
  errorMessage,
  onCancel,
  onConfirm,
}: MergeCategoriesConfirmDialogProps) {
  const { t: translate } = useTranslation();
  // Guardrail: archiving a default (templated) category in favour of a
  // custom one drops its template binding, translation, and "reset to
  // defaults" coverage. The merge still succeeds — we just nudge the
  // user toward the inverse direction.
  const showDefaultIntoCustomWarning =
    source.templateKey != null && target.templateKey == null;
  const values = {
    source: categoryLookup.resolve(source.id).name,
    target: categoryLookup.resolve(target.id).name,
  };

  return (
    <Dialog open onClose={onCancel} maxWidth="xs">
      <DialogTitle>{translate('categoryDialog.mergeConfirmTitle')}</DialogTitle>
      <DialogContent>
        <Typography>
          <Trans
            i18nKey="categoryDialog.mergeConfirmBody"
            values={values}
            components={{ 1: <strong />, 3: <strong /> }}
          />
        </Typography>
        {showDefaultIntoCustomWarning && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Trans
              i18nKey="categoryDialog.mergeDefaultIntoCustomWarning"
              values={values}
              components={{ 1: <strong />, 3: <strong /> }}
            />
          </Alert>
        )}
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
          {pending ? translate('common.saving') : translate('categoryDialog.mergeButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
