import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useTranslation } from 'react-i18next';
import {
  useCategories,
  useCategoryCatalog,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useResetCategories,
  useRestoreCategory,
  useMergeCategories,
} from '../hooks/useCategories';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import { CategoryFormDialog } from './CategoryFormDialog';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import type { Category } from '../types/category';
import { CategoryRow } from './manage-categories/CategoryRow';
import { DeleteCategoryConfirmDialog } from './manage-categories/DeleteCategoryConfirmDialog';
import { ResetCategoriesConfirmDialog } from './manage-categories/ResetCategoriesConfirmDialog';
import { DuplicateNameDialog } from './manage-categories/DuplicateNameDialog';
import { MergeCategoriesConfirmDialog } from './manage-categories/MergeCategoriesConfirmDialog';
import { MergeArchivedConfirmDialog } from './manage-categories/MergeArchivedConfirmDialog';
import {
  findDuplicateCustoms,
  type NameMatches,
} from './manage-categories/duplicateMatching';
import { useArchivedSiblings } from './manage-categories/useArchivedSiblings';

interface ManageCategoriesDialogProps {
  open: boolean;
  onClose: () => void;
}

type CategoryFormData = { name: string; icon: string; color: string };
type PendingAdd = { data: CategoryFormData; matches: NameMatches };

export function ManageCategoriesDialog({ open, onClose }: ManageCategoriesDialogProps) {
  const { t: translate } = useTranslation();
  const { categories, loading, error } = useCategories();
  const { categories: catalog } = useCategoryCatalog();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const resetCategories = useResetCategories();
  const restoreCategoryMutation = useRestoreCategory();
  const mergeCategoriesMutation = useMergeCategories();
  const categoryLookup = useCategoryLookup();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Two-step duplicate-resolution state: when an Add submission collides
  // with one or more existing custom categories (active and/or archived),
  // the form data is parked here while we ask the user how to resolve it.
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  // Two-step merge state: pick the target with `mergeSource` set, then
  // confirm with both set.
  const [mergeSource, setMergeSource] = useState<Category | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Category | null>(null);
  // Single-step "absorb archived same-named siblings" state. Set to the
  // active row whose archived twins should be merged into it.
  const [mergeArchivedFor, setMergeArchivedFor] = useState<Category | null>(null);

  const archivedSiblingsByActiveId = useArchivedSiblings(catalog, categories, categoryLookup);
  const archivedCountFor = (id: string) =>
    archivedSiblingsByActiveId.get(id)?.length ?? 0;

  // Sort once on (categories, lookup); filter independently on every keystroke.
  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) =>
        categoryLookup.resolve(a.id).name.localeCompare(categoryLookup.resolve(b.id).name),
      ),
    [categories, categoryLookup],
  );
  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedCategories;
    return sortedCategories.filter((c) =>
      categoryLookup.resolve(c.id).name.toLowerCase().includes(query),
    );
  }, [sortedCategories, search, categoryLookup]);

  const doCreate = (data: CategoryFormData) => {
    createCategory.mutate(
      { name: data.name, icon: data.icon, color: data.color, sortOrder: categories.length },
      {
        onSuccess: () => {
          setAddOpen(false);
          setPendingAdd(null);
        },
      },
    );
  };

  const handleAdd = (data: CategoryFormData) => {
    const matches = findDuplicateCustoms(catalog, data.name);
    if (matches && (matches.active || matches.archived.length > 0)) {
      setPendingAdd({ data, matches });
      return;
    }
    doCreate(data);
  };

  const handleEdit = (data: CategoryFormData) => {
    if (!editTarget) return;
    // Custom rows always carry the name (it's their identity). Templated rows
    // only get a name override when the user actually changed the displayed
    // translation; otherwise we'd persist the current locale's text and break
    // retranslation on language switch.
    const originalName = categoryLookup.resolve(editTarget.id).name;
    const isTemplated = editTarget.templateKey != null;
    const shouldSendName = !isTemplated || data.name !== originalName;
    const req: { name?: string; icon: string; color: string } = {
      icon: data.icon,
      color: data.color,
      ...(shouldSendName && { name: data.name }),
    };
    updateCategory.mutate(
      { id: editTarget.id, req },
      { onSuccess: () => setEditTarget(null) },
    );
  };

  const handleDeleteConfirm = () => {
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

  const handleUseExisting = () => {
    setPendingAdd(null);
    setAddOpen(false);
  };

  const handleCreateAnyway = () => {
    if (pendingAdd) doCreate(pendingAdd.data);
  };

  /**
   * Resurrect the most-recently-used archived row, then collapse any
   * remaining same-named archived rows into it. Sequential to avoid
   * concurrent writes on the same R2DBC connection and to keep error
   * reporting simple.
   */
  const handleRestoreDuplicate = async () => {
    if (!pendingAdd) return;
    const { archived } = pendingAdd.matches;
    if (archived.length === 0) return;
    const [canonical, ...others] = archived;
    try {
      await restoreCategoryMutation.mutateAsync(canonical.id);
      for (const other of others) {
        await mergeCategoriesMutation.mutateAsync({
          sourceId: other.id,
          targetId: canonical.id,
        });
      }
      setAddOpen(false);
      setPendingAdd(null);
    } catch {
      // Errors surface via the mutation's `error` field rendered below.
    }
  };

  const handleMergePick = (id: string) => {
    const target = categories.find((c) => c.id === id);
    if (target) setMergeTarget(target);
  };

  const cancelMerge = () => {
    setMergeSource(null);
    setMergeTarget(null);
  };

  const handleMergeConfirm = () => {
    if (!mergeSource || !mergeTarget) return;
    mergeCategoriesMutation.mutate(
      { sourceId: mergeSource.id, targetId: mergeTarget.id },
      { onSuccess: cancelMerge },
    );
  };

  /**
   * Absorb every archived same-named sibling of `mergeArchivedFor` into
   * the active row. Sequential to keep error reporting simple and to
   * avoid concurrent writes on the same R2DBC connection.
   */
  const handleMergeArchivedConfirm = async () => {
    if (!mergeArchivedFor) return;
    const siblings = archivedSiblingsByActiveId.get(mergeArchivedFor.id) ?? [];
    if (siblings.length === 0) {
      setMergeArchivedFor(null);
      return;
    }

    try {
      for (const sibling of siblings) {
        await mergeCategoriesMutation.mutateAsync({
          sourceId: sibling.id,
          targetId: mergeArchivedFor.id,
        });
      }
      setMergeArchivedFor(null);
    } catch {
      // Errors surface via the mutation's `error` field rendered below.
    }
  };

  const duplicatePending =
    createCategory.isPending ||
    restoreCategoryMutation.isPending ||
    mergeCategoriesMutation.isPending;
  const duplicateError =
    restoreCategoryMutation.error?.message ??
    mergeCategoriesMutation.error?.message ??
    null;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: { p: 0 } } }}
      >
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {translate('categoryDialog.manageTitle')}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
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
            <Alert severity="error" sx={{ mx: 2, mb: 2 }}>
              {error}
            </Alert>
          )}

          {!loading && filteredCategories.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {categories.length === 0
                  ? translate('categoryDialog.empty')
                  : translate('categoryDialog.noMatches')}
              </Typography>
            </Box>
          )}

          {filteredCategories.map((cat, idx) => (
            <Box key={cat.id}>
              {idx > 0 && <Divider />}
              <CategoryRow
                category={cat}
                categoryLookup={categoryLookup}
                archivedCount={archivedCountFor(cat.id)}
                onEdit={setEditTarget}
                onMerge={setMergeSource}
                onMergeArchived={setMergeArchivedFor}
                onDelete={setDeleteConfirm}
              />
            </Box>
          ))}
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
        <DeleteCategoryConfirmDialog
          category={deleteConfirm}
          categoryLookup={categoryLookup}
          pending={deleteCategory.isPending}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {resetConfirmOpen && (
        <ResetCategoriesConfirmDialog
          pending={resetCategories.isPending}
          errorMessage={resetCategories.error?.message ?? null}
          onCancel={() => setResetConfirmOpen(false)}
          onConfirm={handleReset}
        />
      )}

      {pendingAdd && (
        <DuplicateNameDialog
          name={pendingAdd.data.name}
          matches={pendingAdd.matches}
          pending={duplicatePending}
          errorMessage={duplicateError}
          onCancel={() => setPendingAdd(null)}
          onCreateAnyway={handleCreateAnyway}
          onUseExisting={handleUseExisting}
          onRestore={handleRestoreDuplicate}
        />
      )}

      {/* Merge step 1: pick the target. Reuses the standard picker,
          filtered to active categories ≠ the source. */}
      {mergeSource && !mergeTarget && (
        <CategoryPickerDialog
          open
          onClose={() => setMergeSource(null)}
          selected=""
          onSelect={handleMergePick}
          availableIds={
            new Set(categories.filter((c) => c.id !== mergeSource.id).map((c) => c.id))
          }
          title={translate('categoryDialog.mergeTitle')}
        />
      )}

      {/* Merge step 2: confirm. */}
      {mergeSource && mergeTarget && (
        <MergeCategoriesConfirmDialog
          source={mergeSource}
          target={mergeTarget}
          categoryLookup={categoryLookup}
          pending={mergeCategoriesMutation.isPending}
          errorMessage={mergeCategoriesMutation.error?.message ?? null}
          onCancel={cancelMerge}
          onConfirm={handleMergeConfirm}
        />
      )}

      {mergeArchivedFor && (
        <MergeArchivedConfirmDialog
          name={categoryLookup.resolve(mergeArchivedFor.id).name}
          count={archivedCountFor(mergeArchivedFor.id)}
          pending={mergeCategoriesMutation.isPending}
          errorMessage={mergeCategoriesMutation.error?.message ?? null}
          onCancel={() => setMergeArchivedFor(null)}
          onConfirm={handleMergeArchivedConfirm}
        />
      )}
    </>
  );
}
