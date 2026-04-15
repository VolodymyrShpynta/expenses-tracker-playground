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
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories.ts';
import { getIconByKey } from '../utils/categoryConfig.ts';
import { CategoryFormDialog } from './CategoryFormDialog.tsx';
import type { Category } from '../types/category.ts';

interface ManageCategoriesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ManageCategoriesDialog({ open, onClose }: ManageCategoriesDialogProps) {
  const { categories, loading, error } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const handleAdd = (data: { name: string; icon: string; color: string }) => {
    createCategory.mutate(
      { name: data.name, icon: data.icon, color: data.color, sortOrder: categories.length },
      { onSuccess: () => setAddOpen(false) },
    );
  };

  const handleEdit = (data: { name: string; icon: string; color: string }) => {
    if (!editTarget) return;
    updateCategory.mutate(
      { id: editTarget.id, req: { name: data.name, icon: data.icon, color: data.color } },
      { onSuccess: () => setEditTarget(null) },
    );
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    deleteCategory.mutate(deleteConfirm.id, {
      onSuccess: () => setDeleteConfirm(null),
    });
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { p: 0 } } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Manage Categories
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add
          </Button>
        </DialogTitle>

        <DialogContent sx={{ px: 0, pb: 0 }}>
          <Box sx={{ px: 2, pb: 1 }}>
            <TextField
              placeholder="Search categories…"
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
                {categories.length === 0 ? 'No categories yet. Add your first category!' : 'No matching categories.'}
              </Typography>
            </Box>
          )}

          {filteredCategories.map((cat, idx) => {
            const Icon = getIconByKey(cat.icon);
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
                      backgroundColor: alpha(cat.color, isDark ? 0.25 : 0.15),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 20, color: cat.color }} />
                  </Box>

                  <Typography variant="body1" fontWeight={500} sx={{ flex: 1 }} noWrap>
                    {cat.name}
                  </Typography>

                  <IconButton size="small" onClick={() => setEditTarget(cat)} aria-label={`Edit ${cat.name}`}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteConfirm(cat)}
                    sx={{ color: 'error.main' }}
                    aria-label={`Delete ${cat.name}`}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            );
          })}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Add category dialog */}
      {addOpen && (
        <CategoryFormDialog
          open
          onClose={() => setAddOpen(false)}
          onSave={handleAdd}
          title="Add Category"
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
          title="Edit Category"
          initialName={editTarget.name}
          initialIcon={editTarget.icon}
          initialColor={editTarget.color}
          saving={updateCategory.isPending}
          error={updateCategory.error?.message ?? null}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <Dialog open onClose={() => setDeleteConfirm(null)} maxWidth="xs">
          <DialogTitle>Delete Category</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Existing expenses in this category will keep their category name.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteCategory.isPending}>
              Cancel
            </Button>
            <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteCategory.isPending}>
              {deleteCategory.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
