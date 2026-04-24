import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { alpha, useTheme } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Trans, useTranslation } from 'react-i18next';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useResetCategories } from '../hooks/useCategories.ts';
import { useCategoryLookup } from '../hooks/useCategoryLookup.ts';
import { CategoryFormDialog } from './CategoryFormDialog.tsx';
import type { Category } from '../types/category.ts';

interface ManageCategoriesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ManageCategoriesDialog({ open, onClose }: ManageCategoriesDialogProps) {
  const { t: translate } = useTranslation();
  const { categories, loading, error } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const resetCategories = useResetCategories();
  const categoryLookup = useCategoryLookup();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) =>
      categoryLookup.resolve(a.id).name.localeCompare(categoryLookup.resolve(b.id).name),
    );
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter((c) => categoryLookup.resolve(c.id).name.toLowerCase().includes(q));
  }, [categories, search, categoryLookup]);

  const handleAdd = (data: { name: string; icon: string; color: string }) => {
    createCategory.mutate(
      { name: data.name, icon: data.icon, color: data.color, sortOrder: categories.length },
      { onSuccess: () => setAddOpen(false) },
    );
  };

  const handleEdit = (data: { name: string; icon: string; color: string }) => {
    if (!editTarget) return;
    // For templated rows, only persist a name override if the user actually
    // changed the displayed translation. Sending the same translated string
    // back would store it as a permanent override and prevent retranslation
    // on language switch.
    const originalName = categoryLookup.resolve(editTarget.id).name;
    const nameChanged = data.name !== originalName;
    const isTemplated = editTarget.templateKey != null;
    const req: { name?: string; icon: string; color: string } = {
      icon: data.icon,
      color: data.color,
    };
    if (!isTemplated) {
      // Custom row — always send the name (it's the only identifier).
      req.name = data.name;
    } else if (nameChanged) {
      // Templated row, user changed the name — send override (or empty
      // string to clear back to the translation).
      req.name = data.name;
    }
    updateCategory.mutate(
      { id: editTarget.id, req },
      { onSuccess: () => setEditTarget(null) },
    );
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    deleteCategory.mutate(deleteConfirm.id, {
      onSuccess: () => setDeleteConfirm(null),
    });
  };

  const handleReset = () => {
    resetCategories.mutate(undefined, {
      onSuccess: () => setResetConfirmOpen(false),
    });
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { p: 0 } } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {translate('categoryDialog.manageTitle')}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            {translate('common.add')}
          </Button>
        </DialogTitle>

        <DialogContent sx={{ px: 0, pb: 0 }}>
          <Box sx={{ px: 2, pb: 1 }}>
            <TextField
              placeholder={translate('categoryDialog.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{error}</Alert>
          )}

          {!loading && filteredCategories.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {categories.length === 0 ? translate('categoryDialog.empty') : translate('categoryDialog.noMatches')}
              </Typography>
            </Box>
          )}

          {filteredCategories.map((cat, idx) => {
            const resolved = categoryLookup.resolve(cat.id);
            const Icon = resolved.icon;
            return (
              <Box key={cat.id}>
                {idx > 0 && <Divider />}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    px: 3,
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: alpha(resolved.color, isDark ? 0.25 : 0.15),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 20, color: resolved.color }} />
                  </Box>

                  <Typography variant="body1" fontWeight={500} sx={{ flex: 1 }} noWrap>
                    {resolved.name}
                  </Typography>

                  <IconButton size="small" onClick={() => setEditTarget(cat)} aria-label={translate('categoryDialog.editAriaLabel', { name: resolved.name })}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteConfirm(cat)}
                    sx={{ color: 'error.main' }}
                    aria-label={translate('categoryDialog.deleteAriaLabel', { name: resolved.name })}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            );
          })}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          <Button
            size="small"
            color="warning"
            startIcon={<RestartAltIcon />}
            onClick={() => setResetConfirmOpen(true)}
            disabled={loading || resetCategories.isPending}
          >
            {translate('categoryDialog.resetButton')}
          </Button>
          <Button onClick={onClose}>{translate('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Add category dialog */}
      {addOpen && (
        <CategoryFormDialog
          open
          onClose={() => setAddOpen(false)}
          onSave={handleAdd}
          title={translate('categoryDialog.addTitle')}
          saving={createCategory.isPending}
          error={createCategory.error?.message ?? null}
        />
      )}

      {/* Edit category dialog */}
      {editTarget && (
        <CategoryFormDialog
          key={editTarget.id}
          open
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          title={translate('categoryDialog.editTitle')}
          initialName={categoryLookup.resolve(editTarget.id).name}
          initialIcon={editTarget.icon}
          initialColor={editTarget.color}
          saving={updateCategory.isPending}
          error={updateCategory.error?.message ?? null}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <Dialog open onClose={() => setDeleteConfirm(null)} maxWidth="xs">
          <DialogTitle>{translate('categoryDialog.deleteTitle')}</DialogTitle>
          <DialogContent>
            <Typography>
              <Trans
                i18nKey="categoryDialog.deleteConfirm"
                values={{ name: categoryLookup.resolve(deleteConfirm.id).name }}
                components={{ 1: <strong /> }}
              />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {translate('categoryDialog.deleteNote')}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteCategory.isPending}>
              {translate('common.cancel')}
            </Button>
            <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteCategory.isPending}>
              {deleteCategory.isPending ? translate('common.deleting') : translate('common.delete')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Reset to defaults confirmation dialog */}
      {resetConfirmOpen && (
        <Dialog open onClose={() => setResetConfirmOpen(false)} maxWidth="xs">
          <DialogTitle>{translate('categoryDialog.resetTitle')}</DialogTitle>
          <DialogContent>
            <Typography>{translate('categoryDialog.resetConfirm')}</Typography>
            {resetCategories.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {resetCategories.error.message}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResetConfirmOpen(false)} disabled={resetCategories.isPending}>
              {translate('common.cancel')}
            </Button>
            <Button color="warning" variant="contained" onClick={handleReset} disabled={resetCategories.isPending}>
              {resetCategories.isPending ? translate('common.saving') : translate('categoryDialog.resetConfirmButton')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
