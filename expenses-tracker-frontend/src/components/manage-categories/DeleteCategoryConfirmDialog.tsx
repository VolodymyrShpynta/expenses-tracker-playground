import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Trans, useTranslation } from 'react-i18next';
import type { Category } from '../../types/category';
import type { CategoryLookup } from '../../hooks/useCategoryLookup';

/**
 * Two-button confirmation dialog for soft-deleting a category.
 * Existing expenses keep their `categoryId`; the catalog row is just
 * archived and can later be resurrected via the duplicate-name flow.
 */
interface DeleteCategoryConfirmDialogProps {
  category: Category;
  categoryLookup: CategoryLookup;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteCategoryConfirmDialog({
  category,
  categoryLookup,
  pending,
  onCancel,
  onConfirm,
}: DeleteCategoryConfirmDialogProps) {
  const { t: translate } = useTranslation();
  return (
    <Dialog open onClose={onCancel} maxWidth="xs">
      <DialogTitle>{translate('categoryDialog.deleteTitle')}</DialogTitle>
      <DialogContent>
        <Typography>
          <Trans
            i18nKey="categoryDialog.deleteConfirm"
            values={{ name: categoryLookup.resolve(category.id).name }}
            components={{ 1: <strong /> }}
          />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {translate('categoryDialog.deleteNote')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          {translate('common.cancel')}
        </Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={pending}>
          {pending ? translate('common.deleting') : translate('common.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
