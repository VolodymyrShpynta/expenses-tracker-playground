import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import { SUPPORTED_CURRENCIES } from '../api/exchange.ts';
import type { CurrencyCode } from '../api/exchange.ts';

interface CurrencyPickerDialogProps {
  open: boolean;
  onClose: () => void;
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
}

export function CurrencyPickerDialog({ open, onClose, value, onChange }: CurrencyPickerDialogProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return SUPPORTED_CURRENCIES;
    const q = search.trim().toLowerCase();
    return SUPPORTED_CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [search]);

  const handleSelect = (code: CurrencyCode) => {
    onChange(code);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { p: 0 } } }}>
      <DialogTitle>Select Currency</DialogTitle>

      <DialogContent sx={{ px: 0, pb: 0 }}>
        <Box sx={{ px: 2, pb: 1 }}>
          <TextField
            placeholder="Search currencies…"
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

        <List sx={{ maxHeight: 360, overflow: 'auto', pt: 0 }}>
          {filtered.map((cur) => {
            const selected = cur.code === value;
            return (
              <ListItemButton
                key={cur.code}
                onClick={() => handleSelect(cur.code as CurrencyCode)}
                selected={selected}
                sx={{ px: 3 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1" fontWeight={600} sx={{ minWidth: 40 }}>
                        {cur.code}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {cur.name}
                      </Typography>
                    </Box>
                  }
                />
                {selected && <CheckIcon fontSize="small" color="primary" />}
              </ListItemButton>
            );
          })}
          {filtered.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No matching currencies.
              </Typography>
            </Box>
          )}
        </List>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
