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
import CallMergeIcon from '@mui/icons-material/CallMerge';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Badge from '@mui/material/Badge';
import Tooltip from '@mui/material/Tooltip';
import { Trans, useTranslation } from 'react-i18next';
import {
  useCategories,
  useCategoryCatalog,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useResetCategories,
  useRestoreCategory,
  useMergeCategories,
} from '../hooks/useCategories.ts';
import { useCategoryLookup } from '../hooks/useCategoryLookup.ts';
import { CategoryFormDialog } from './CategoryFormDialog.tsx';
import { CategoryPickerDialog } from './CategoryPickerDialog.tsx';
import type { Category } from '../types/category.ts';

interface ManageCategoriesDialogProps {
  open: boolean;
  onClose: () => void;
}

type CategoryFormData = { name: string; icon: string; color: string };

/**
 * Custom categories that match the input name (case- and whitespace-
 * insensitive). Templated rows are intentionally excluded — the seeder
 * owns their lifecycle.
 *
 * - `active` is the (single) live row with that name, if any.
 * - `archived` is every soft-deleted row with that name, sorted with the
 *   most recently used first — [0] is the canonical row to restore.
 */
interface NameMatches {
  active: Category | null;
  archived: Category[];
}

/** Case-insensitive, whitespace-trimmed normalisation for duplicate detection. */
const normalizeName = (s: string) => s.trim().toLocaleLowerCase();

function findDuplicateCustoms(catalog: Category[], rawName: string): NameMatches | null {
  const needle = normalizeName(rawName);
  if (!needle) return null;
  const matches = catalog.filter(
    (c) => c.templateKey == null && c.name != null && normalizeName(c.name) === needle,
  );
  if (matches.length === 0) return null;
  return {
    active: matches.find((c) => !c.deleted) ?? null,
    archived: matches
      .filter((c) => c.deleted)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Two-step duplicate-resolution state: when an Add submission collides
  // with one or more existing custom categories (active and/or archived),
  // the form data is parked here while we ask the user how to resolve it.
  const [pendingAdd, setPendingAdd] = useState<{ data: CategoryFormData; matches: NameMatches } | null>(null);
  // Two-step merge state: pick the target with `mergeSource` set, then
  // confirm with both set.
  const [mergeSource, setMergeSource] = useState<Category | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Category | null>(null);
  // Single-step "absorb archived same-named siblings" state. Set to the
  // active row whose archived twins should be merged into it.
  const [mergeArchivedFor, setMergeArchivedFor] = useState<Category | null>(null);

  /**
   * For every active row, the list of soft-deleted catalog rows that share
   * its (case- and whitespace-insensitive) display name. Used to surface
   * the "absorb archived twins" affordance on rows whose old expenses are
   * stranded under an archived duplicate.
   *
   * The display name comes from `categoryLookup`, so this works
   * symmetrically for custom-vs-archived-templated and
   * templated-vs-archived-custom collisions.
   */
  /**
   * For every active row, the list of *other* catalog rows (active or
   * archived) that share its display name and still own at least one
   * active expense — i.e. rows it makes sense to absorb in one click.
   *
   * Display name resolution goes through `categoryLookup`, so a
   * Ukrainian custom row matches an archived templated `savings` row
   * and a casing-only collision (e.g. `Заощадження` vs `заощадження`)
   * is recognised as a duplicate as well.
   *
   * Active twins are symmetric: both rows surface the affordance, and
   * clicking it on either absorbs the *other* into "this".
   */
  const archivedSiblingsByActiveId = useMemo(() => {
    // Skip rows whose expenses have all been migrated already
    // (`activeExpenseCount === 0`); merging them would be a no-op.
    const candidates = catalog.filter((c) => c.activeExpenseCount > 0);
    if (candidates.length === 0) return new Map<string, Category[]>();
    const byName = new Map<string, Category[]>();
    for (const a of candidates) {
      const key = normalizeName(categoryLookup.resolve(a.id).name);
      if (!key) continue;
      const list = byName.get(key);
      if (list) list.push(a);
      else byName.set(key, [a]);
    }
    const result = new Map<string, Category[]>();
    for (const active of categories) {
      const key = normalizeName(categoryLookup.resolve(active.id).name);
      const group = key ? byName.get(key) : undefined;
      if (!group) continue;
      // Exclude self; everything else (active or archived) is a sibling
      // we can absorb into this row.
      const siblings = group.filter((c) => c.id !== active.id);
      if (siblings.length > 0) {
        result.set(active.id, siblings);
      }
    }
    return result;
  }, [catalog, categories, categoryLookup]);

  const filteredCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) =>
      categoryLookup.resolve(a.id).name.localeCompare(categoryLookup.resolve(b.id).name),
    );
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter((c) => categoryLookup.resolve(c.id).name.toLowerCase().includes(q));
  }, [categories, search, categoryLookup]);

  const handleAdd = (data: CategoryFormData) => {
    const matches = findDuplicateCustoms(catalog, data.name);
    if (matches && (matches.active || matches.archived.length > 0)) {
      setPendingAdd({ data, matches });
      return;
    }
    doCreate(data);
  };

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

  const handleUseExisting = () => {
    setPendingAdd(null);
    setAddOpen(false);
  };

  const handleCreateAnyway = () => {
    if (pendingAdd) doCreate(pendingAdd.data);
  };

  const handleRestoreDuplicate = async () => {
    if (!pendingAdd) return;
    const { archived } = pendingAdd.matches;
    if (archived.length === 0) return;
    const [canonical, ...others] = archived;
    try {
      // 1. Resurrect the most-recently-used archived row — it becomes the
      //    target for any subsequent merges.
      await restoreCategoryMutation.mutateAsync(canonical.id);
      // 2. Collapse the remaining archived same-named rows into the
      //    canonical one. Sequential to avoid concurrent writes on the
      //    same R2DBC connection and to keep error reporting simple.
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

  const handleMergeConfirm = () => {
    if (!mergeSource || !mergeTarget) return;
    mergeCategoriesMutation.mutate(
      { sourceId: mergeSource.id, targetId: mergeTarget.id },
      {
        onSuccess: () => {
          setMergeSource(null);
          setMergeTarget(null);
        },
      },
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

  const handleEdit = (data: CategoryFormData) => {
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
            const archivedSiblings = archivedSiblingsByActiveId.get(cat.id) ?? [];
            const archivedCount = archivedSiblings.length;
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

                  {archivedCount > 0 && (
                    <Tooltip
                      title={translate('categoryDialog.mergeArchivedTooltip', { count: archivedCount })}
                    >
                      <IconButton
                        size="small"
                        onClick={() => setMergeArchivedFor(cat)}
                        aria-label={translate('categoryDialog.mergeArchivedAriaLabel', {
                          name: resolved.name,
                          count: archivedCount,
                        })}
                      >
                        <Badge badgeContent={archivedCount} color="warning">
                          <Inventory2OutlinedIcon fontSize="small" />
                        </Badge>
                      </IconButton>
                    </Tooltip>
                  )}

                  <IconButton size="small" onClick={() => setEditTarget(cat)} aria-label={translate('categoryDialog.editAriaLabel', { name: resolved.name })}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setMergeSource(cat)}
                    aria-label={translate('categoryDialog.mergeAriaLabel', { name: resolved.name })}
                  >
                    <CallMergeIcon fontSize="small" />
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

      {/* Duplicate-name prompt: shown when the user submits Add and one or
          more custom categories with the same (case-insensitive, trimmed)
          name already exist. Three branches:
          - An *active* row exists       → "Use existing" / "Create anyway".
          - One *archived* row only      → "Restore" / "Create new".
          - Multiple *archived* rows     → "Restore & merge" (collapses
                                           every match into one) / "Create new".
        */}
      {pendingAdd && (() => {
        const { active, archived } = pendingAdd.matches;
        const hasActive = active != null;
        const archivedOnly = !hasActive && archived.length > 0;
        const multipleArchived = archivedOnly && archived.length > 1;
        const inFlight =
          createCategory.isPending ||
          restoreCategoryMutation.isPending ||
          mergeCategoriesMutation.isPending;
        const restoreError =
          restoreCategoryMutation.error?.message ??
          mergeCategoriesMutation.error?.message ??
          null;
        return (
          <Dialog open onClose={() => setPendingAdd(null)} maxWidth="xs">
            <DialogTitle>
              {hasActive
                ? translate('categoryDialog.duplicateActiveTitle')
                : multipleArchived
                  ? translate('categoryDialog.duplicateMultipleArchivedTitle')
                  : translate('categoryDialog.duplicateArchivedTitle')}
            </DialogTitle>
            <DialogContent>
              <Typography>
                <Trans
                  i18nKey={
                    hasActive
                      ? 'categoryDialog.duplicateActiveBody'
                      : multipleArchived
                        ? 'categoryDialog.duplicateMultipleArchivedBody'
                        : 'categoryDialog.duplicateArchivedBody'
                  }
                  values={{ name: pendingAdd.data.name.trim(), count: archived.length }}
                  components={{ 1: <strong /> }}
                />
              </Typography>
              {restoreError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {restoreError}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPendingAdd(null)} disabled={inFlight}>
                {translate('common.cancel')}
              </Button>
              {archivedOnly ? (
                <>
                  <Button onClick={handleCreateAnyway} disabled={inFlight}>
                    {translate('categoryDialog.createNewButton')}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleRestoreDuplicate}
                    disabled={inFlight}
                  >
                    {inFlight
                      ? translate('common.saving')
                      : multipleArchived
                        ? translate('categoryDialog.restoreAndMergeButton')
                        : translate('categoryDialog.restoreButton')}
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleCreateAnyway} disabled={inFlight}>
                    {translate('categoryDialog.createAnywayButton')}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleUseExisting}
                    disabled={inFlight}
                  >
                    {translate('categoryDialog.useExistingButton')}
                  </Button>
                </>
              )}
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* Merge step 1: pick the target category. Reuses the standard
          picker, filtered to active categories ≠ the source. */}
      {mergeSource && !mergeTarget && (
        <CategoryPickerDialog
          open
          onClose={() => setMergeSource(null)}
          selected=""
          onSelect={handleMergePick}
          availableIds={
            new Set(
              categories.filter((c) => c.id !== mergeSource.id).map((c) => c.id),
            )
          }
          title={translate('categoryDialog.mergeTitle')}
        />
      )}

      {/* Merge step 2: confirm. */}
      {mergeSource && mergeTarget && (
        <Dialog
          open
          onClose={() => {
            setMergeTarget(null);
          }}
          maxWidth="xs"
        >
          <DialogTitle>{translate('categoryDialog.mergeConfirmTitle')}</DialogTitle>
          <DialogContent>
            <Typography>
              <Trans
                i18nKey="categoryDialog.mergeConfirmBody"
                values={{
                  source: categoryLookup.resolve(mergeSource.id).name,
                  target: categoryLookup.resolve(mergeTarget.id).name,
                }}
                components={{ 1: <strong />, 3: <strong /> }}
              />
            </Typography>
            {/* Guardrail: archiving a default (templated) category in favour
                of a custom one drops its template binding, translation, and
                "reset to defaults" coverage. The merge still succeeds — we
                just nudge the user toward the inverse direction. */}
            {mergeSource.templateKey != null && mergeTarget.templateKey == null && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Trans
                  i18nKey="categoryDialog.mergeDefaultIntoCustomWarning"
                  values={{
                    source: categoryLookup.resolve(mergeSource.id).name,
                    target: categoryLookup.resolve(mergeTarget.id).name,
                  }}
                  components={{ 1: <strong />, 3: <strong /> }}
                />
              </Alert>
            )}
            {mergeCategoriesMutation.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {mergeCategoriesMutation.error.message}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setMergeSource(null);
                setMergeTarget(null);
              }}
              disabled={mergeCategoriesMutation.isPending}
            >
              {translate('common.cancel')}
            </Button>
            <Button
              variant="contained"
              onClick={handleMergeConfirm}
              disabled={mergeCategoriesMutation.isPending}
            >
              {mergeCategoriesMutation.isPending
                ? translate('common.saving')
                : translate('categoryDialog.mergeButton')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* "Absorb archived twins" confirmation: collapses every soft-deleted
          same-named row into the active row in one click. */}
      {mergeArchivedFor && (() => {
        const siblings = archivedSiblingsByActiveId.get(mergeArchivedFor.id) ?? [];
        const count = siblings.length;
        const name = categoryLookup.resolve(mergeArchivedFor.id).name;
        return (
          <Dialog open onClose={() => setMergeArchivedFor(null)} maxWidth="xs">
            <DialogTitle>{translate('categoryDialog.mergeArchivedTitle')}</DialogTitle>
            <DialogContent>
              <Typography>
                <Trans
                  i18nKey="categoryDialog.mergeArchivedConfirm"
                  values={{ count, name }}
                  components={{ 1: <strong /> }}
                />
              </Typography>
              {mergeCategoriesMutation.error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {mergeCategoriesMutation.error.message}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setMergeArchivedFor(null)}
                disabled={mergeCategoriesMutation.isPending}
              >
                {translate('common.cancel')}
              </Button>
              <Button
                variant="contained"
                onClick={handleMergeArchivedConfirm}
                disabled={mergeCategoriesMutation.isPending}
              >
                {mergeCategoriesMutation.isPending
                  ? translate('common.saving')
                  : translate('categoryDialog.mergeArchivedButton')}
              </Button>
            </DialogActions>
          </Dialog>
        );
      })()}
    </>
  );
}
