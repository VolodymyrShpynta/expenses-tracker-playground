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
import { useCategories } from '../hooks/useCategories.ts';
import { getIconByKey } from '../utils/categoryConfig.ts';
import type { Category } from '../types/category.ts';

interface CategoryPickerDialogProps {
  open: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (name: string) => void;
  /** Optional whitelist of category names to show. If provided, only these categories are listed. */
  availableNames?: ReadonlySet<string>;
  title?: string;
}

/**
 * List-style category picker (no autofocus on the search field — avoids
 * popping the virtual keyboard on mobile).
 */
export function CategoryPickerDialog({ open, onClose, selected, onSelect, availableNames, title = 'Pick Category' }: CategoryPickerDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { categories, loading, error } = useCategories();
  const [search, setSearch] = useState('');

  const filtered = useMemo<Category[]>(() => {
    const base = availableNames
      ? categories.filter((c) => availableNames.has(c.name))
      : categories;
    const sorted = [...base].sort((a, b) => a.name.localeCompare(b.name));
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, availableNames, search]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { p: 0 } } }}
    >
      <DialogTitle>{title}</DialogTitle>

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

        {error && <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{error}</Alert>}

        {!loading && filtered.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {categories.length === 0 ? 'No categories yet.' : 'No matching categories.'}
            </Typography>
          </Box>
        )}

        <Box sx={{ maxHeight: 360, overflow: 'auto' }}>
          {filtered.map((cat, idx) => {
            const Icon = getIconByKey(cat.icon);
            const isSelected = cat.name === selected;
            return (
              <Box key={cat.id}>
                {idx > 0 && <Divider />}
                <ButtonBase
                  onClick={() => onSelect(cat.name)}
                  sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    px: 3,
                    justifyContent: 'flex-start',
                    bgcolor: isSelected ? alpha(cat.color, isDark ? 0.2 : 0.1) : 'transparent',
                    '&:hover': { bgcolor: alpha(cat.color, isDark ? 0.25 : 0.15) },
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
                  <Typography
                    variant="body1"
                    fontWeight={isSelected ? 600 : 500}
                    sx={{ flex: 1, textAlign: 'left' }}
                    noWrap
                  >
                    {cat.name}
                  </Typography>
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
