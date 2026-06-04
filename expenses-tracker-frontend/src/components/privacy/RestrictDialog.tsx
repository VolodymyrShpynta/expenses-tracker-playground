/**
 * Dialog to apply a GDPR Article 18 restriction. Used in both subject
 * and admin variants: the subject variant treats `reasonNote` as
 * optional, the admin variant enforces a minimum 10-character note
 * because operator-initiated actions must be auditable.
 */
import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import { useTranslation } from 'react-i18next';
import { RESTRICTION_GROUNDS, type RestrictionGround } from '../../types/privacy';

interface RestrictDialogProps {
  open: boolean;
  onClose: () => void;
  /** When true, the reason note is required with a 10-char minimum. */
  isAdmin: boolean;
  /** Awaited by the dialog so it can show pending state and close on success. */
  onSubmit: (req: { ground: RestrictionGround; reasonNote?: string }) => Promise<void>;
}

const REASON_MIN = 10;
const REASON_MAX = 1000;

export function RestrictDialog({ open, onClose, isAdmin, onSubmit }: RestrictDialogProps) {
  const { t: translate } = useTranslation();
  const [ground, setGround] = useState<RestrictionGround>('ACCURACY_CONTESTED');
  const [reasonNote, setReasonNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reasonNote.trim();
  const adminReasonInvalid = isAdmin && trimmed.length < REASON_MIN;
  const helperText = isAdmin
    ? trimmed.length === 0
      ? translate('admin.users.restrictDialog.reasonRequired')
      : adminReasonInvalid
        ? translate('admin.users.restrictDialog.reasonTooShort')
        : translate('privacy.restrictDialog.reasonHelper')
    : translate('privacy.restrictDialog.reasonHelper');

  const handleSubmit = async () => {
    if (adminReasonInvalid) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        ground,
        reasonNote: trimmed.length > 0 ? trimmed : undefined,
      });
      // Reset for next open.
      setReasonNote('');
      setGround('ACCURACY_CONTESTED');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isAdmin
          ? translate('admin.users.restrictDialog.title')
          : translate('privacy.restrictDialog.title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <DialogContentText>
            {isAdmin
              ? translate('admin.users.restrictDialog.body')
              : translate('privacy.restrictDialog.body')}
          </DialogContentText>
          <TextField
            select
            label={translate('privacy.restriction.fieldGround')}
            value={ground}
            onChange={(e) => setGround(e.target.value as RestrictionGround)}
            fullWidth
            disabled={submitting}
          >
            {RESTRICTION_GROUNDS.map((g) => (
              <MenuItem key={g} value={g}>
                {translate(`privacy.restrictDialog.grounds.${g}`)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={
              isAdmin
                ? translate('admin.users.restrictDialog.reasonLabel')
                : translate('privacy.restrictDialog.reasonLabel')
            }
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value.slice(0, REASON_MAX))}
            multiline
            minRows={3}
            maxRows={6}
            fullWidth
            required={isAdmin}
            error={isAdmin && trimmed.length > 0 && adminReasonInvalid}
            helperText={helperText}
            disabled={submitting}
            slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {translate('common.cancel')}
        </Button>
        <Button
          onClick={() => {
            void handleSubmit();
          }}
          variant="contained"
          color="warning"
          disabled={submitting || adminReasonInvalid}
        >
          {submitting
            ? translate('privacy.restrictDialog.submitting')
            : translate('privacy.restrictDialog.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
