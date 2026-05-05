import { createElement, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import { useTranslation } from 'react-i18next';
import { AVAILABLE_ICONS, AVAILABLE_COLORS, getIconByKey } from '../utils/categoryConfig';
import type { IconOption } from '../utils/categoryConfig';
import { FIELD_LIMITS } from '../utils/fieldLimits';

interface IconPickerProps {
  value: string;
  onChange: (iconKey: string) => void;
  selectedColor: string;
}

function IconPicker({ value, onChange, selectedColor }: IconPickerProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {AVAILABLE_ICONS.map((opt: IconOption) => {
        const Icon = opt.icon;
        const selected = value === opt.key;
        return (
          <Tooltip key={opt.key} title={opt.label}>
            <IconButton
              size="small"
              onClick={() => onChange(opt.key)}
              sx={{
                width: 40,
                height: 40,
                border: selected ? `2px solid ${selectedColor}` : '2px solid transparent',
                backgroundColor: selected ? alpha(selectedColor, isDark ? 0.25 : 0.12) : 'transparent',
                '&:hover': { backgroundColor: alpha(selectedColor, 0.15) },
              }}
            >
              <Icon sx={{ fontSize: 20, color: selected ? selectedColor : 'text.secondary' }} />
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {AVAILABLE_COLORS.map((color) => (
        <Box
          key={color}
          onClick={() => onChange(color)}
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: color,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: value === color ? '3px solid' : '2px solid transparent',
            borderColor: value === color ? 'text.primary' : 'transparent',
            transition: 'border-color 0.15s',
            '&:hover': { opacity: 0.8 },
          }}
        >
          {value === color && (
            <CheckIcon
              sx={(theme) => ({ fontSize: 16, color: theme.palette.getContrastText(color) })}
            />
          )}
        </Box>
      ))}
    </Box>
  );
}

interface CategoryFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; icon: string; color: string }) => void;
  title: string;
  initialName?: string;
  initialIcon?: string;
  initialColor?: string;
  saving?: boolean;
  error?: string | null;
  nameDisabled?: boolean;
}

export function CategoryFormDialog({
  open,
  onClose,
  onSave,
  title,
  initialName = '',
  initialIcon = 'Category',
  initialColor = '#78909c',
  saving = false,
  error = null,
  nameDisabled = false,
}: CategoryFormDialogProps) {
  const { t: translate } = useTranslation();
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor);
  const [validationError, setValidationError] = useState<string | null>(null);

  const previewIcon = getIconByKey(icon);
  const displayError = validationError ?? error;

  const handleSave = () => {
    setValidationError(null);
    if (!name.trim()) {
      setValidationError(translate('categoryDialog.nameRequired'));
      return;
    }
    onSave({ name: name.trim(), icon, color });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { p: 1 } } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
        {displayError && <Alert severity="error">{displayError}</Alert>}

        {/* Preview */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: alpha(color, 0.2),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {createElement(previewIcon, { sx: { fontSize: 28, color } })}
          </Box>
          <Typography variant="h6" fontWeight={600}>
            {name || translate('categoryDialog.defaultCategoryLabel')}
          </Typography>
        </Box>

        <TextField
          label={translate('categoryDialog.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
          size="small"
          disabled={nameDisabled}
          helperText={`${name.length}/${FIELD_LIMITS.CATEGORY_NAME_MAX}`}
          slotProps={{ htmlInput: { maxLength: FIELD_LIMITS.CATEGORY_NAME_MAX } }}
        />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{translate('categoryDialog.icon')}</Typography>
          <IconPicker value={icon} onChange={setIcon} selectedColor={color} />
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{translate('categoryDialog.color')}</Typography>
          <ColorPicker value={color} onChange={setColor} />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>{translate('common.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? translate('common.saving') : translate('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
