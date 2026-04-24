import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n';
import { resolveLanguage } from '../i18n/locale.ts';

interface LanguagePickerDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LanguagePickerDialog({ open, onClose }: LanguagePickerDialogProps) {
  const { t: translate, i18n } = useTranslation();

  const active = resolveLanguage(i18n);

  const handleSelect = (code: LanguageCode) => {
    void i18n.changeLanguage(code);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { p: 0 } } }}>
      <DialogTitle>{translate('languageDialog.title')}</DialogTitle>
      <DialogContent sx={{ px: 0, pb: 0 }}>
        <List sx={{ pt: 0 }}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const selected = lang.code === active;
            return (
              <ListItemButton
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                selected={selected}
                sx={{ px: 3 }}
              >
                <ListItemText
                  primary={
                    <Typography variant="body1" fontWeight={selected ? 600 : 500}>
                      {lang.nativeLabel}
                    </Typography>
                  }
                  secondary={lang.nativeLabel === lang.label ? undefined : lang.label}
                />
                {selected && <CheckIcon fontSize="small" color="primary" />}
              </ListItemButton>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
