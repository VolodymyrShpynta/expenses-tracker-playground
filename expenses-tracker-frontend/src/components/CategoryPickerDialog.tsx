import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import SearchIcon from '@mui/icons-material/Search';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useCategories } from '../hooks/useCategories';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import type { Category } from '../types/category';

interface CategoryPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Currently selected category id, or empty string for none. */
  selected: string;
  /** Called with the selected category's id (and resolved name for convenience). */
  onSelect: (id: string, name: string) => void;
  /** Optional whitelist of category ids to show. If provided, only these categories are listed. */
  availableIds?: ReadonlySet<string>;
  title?: string;
}

/**
 * List-style category picker (no autofocus on the search field — avoids
 * popping the virtual keyboard on mobile).
 */
export function CategoryPickerDialog({ open, onClose, selected, onSelect, availableIds, title }: CategoryPickerDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { categories, loading, error } = useCategories();
  const categoryLookup = useCategoryLookup();
  const [search, setSearch] = useState('');
  const dialogTitle = title ?? translate('categoryDialog.pickTitle');

  const filtered = useMemo<Category[]>(() => {
    const base = availableIds
      ? categories.filter((c) => availableIds.has(c.id))
      : categories;
    const sorted = [...base].sort((a, b) =>
      categoryLookup.resolve(a.id).name.localeCompare(categoryLookup.resolve(b.id).name),
    );
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => categoryLookup.resolve(c.id).name.toLowerCase().includes(q));
  }, [categories, availableIds, search, categoryLookup]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { p: 0 } } }}
    >
      <DialogTitle>{dialogTitle}</DialogTitle>

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

        {error && <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{error}</Alert>}

        {!loading && filtered.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {categories.length === 0 ? translate('categoryDialog.emptyShort') : translate('categoryDialog.noMatches')}
            </Typography>
          </Box>
        )}

        <Box sx={{ maxHeight: 360, overflow: 'auto' }}>
          {filtered.map((cat, idx) => {
            const resolved = categoryLookup.resolve(cat.id);
            const Icon = resolved.icon;
            const isSelected = cat.id === selected;
            return (
              <Box key={cat.id}>
                {idx > 0 && <Divider />}
                <ButtonBase
                  onClick={() => onSelect(cat.id, resolved.name)}
                  sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    px: 3,
                    justifyContent: 'flex-start',
                    bgcolor: isSelected ? alpha(resolved.color, isDark ? 0.2 : 0.1) : 'transparent',
                    '&:hover': { bgcolor: alpha(resolved.color, isDark ? 0.25 : 0.15) },
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
                  <Typography
                    variant="body1"
                    fontWeight={isSelected ? 600 : 500}
                    sx={{ flex: 1, textAlign: 'left' }}
                    noWrap
                  >
                    {resolved.name}
                  </Typography>
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{translate('common.cancel')}</Button>
      </DialogActions>
    </Dialog>
  );
}
