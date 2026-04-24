import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import CheckIcon from '@mui/icons-material/Check';
import { FONT_SCALE_LABEL, type FontScale } from '../theme.ts';

interface FontSizePickerDialogProps {
  open: boolean;
  onClose: () => void;
  value: FontScale;
  onChange: (scale: FontScale) => void;
}

const OPTIONS: { scale: FontScale; previewPx: number }[] = [
  { scale: 'small', previewPx: 13 },
  { scale: 'medium', previewPx: 15 },
  { scale: 'large', previewPx: 17 },
  { scale: 'xlarge', previewPx: 19 },
];

export function FontSizePickerDialog({ open, onClose, value, onChange }: FontSizePickerDialogProps) {
  const handleSelect = (scale: FontScale) => {
    onChange(scale);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Font Size</DialogTitle>
      <DialogContent sx={{ px: 0, pb: 0 }}>
        <List sx={{ pt: 0 }}>
          {OPTIONS.map(({ scale, previewPx }) => {
            const selected = scale === value;
            return (
              <ListItemButton
                key={scale}
                onClick={() => handleSelect(scale)}
                selected={selected}
                sx={{ px: 3 }}
              >
                <ListItemText
                  primary={FONT_SCALE_LABEL[scale]}
                  slotProps={{ primary: { sx: { fontSize: previewPx, fontWeight: 500 } } }}
                />
                {selected && <CheckIcon fontSize="small" color="primary" />}
              </ListItemButton>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
