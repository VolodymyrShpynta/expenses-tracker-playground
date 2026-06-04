/**
 * Paranoid 3-stage erasure dialog. There is no Undo for GDPR Art. 17.
 *
 * Stage 1 — CONFIRM:
 *   - Three acknowledgement checkboxes (different wording for subject vs admin).
 *   - Typed-confirmation field that must exactly match `expectedConfirmText`
 *     (username for self-erasure, userId for admin erasure).
 *   - For admin, additionally a mandatory reason note ≥ 10 characters.
 *
 * Stage 2 — COUNTDOWN:
 *   - Final "Delete forever" button disabled for {countdownSeconds} seconds
 *     after the user clicks Continue. Forces a deliberate pause.
 *
 * Stage 3 — SUMMARY:
 *   - Server returns cascade counts + follow-up instruction strings.
 *   - For the subject variant, the page that hosts this dialog is responsible
 *     for the logout countdown (we just hand back the result via onErased).
 */
import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation, Trans } from 'react-i18next';
import type { ErasureResultDto } from '../../types/privacy';

interface EraseConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** True for admin variant: requires a reasonNote and uses admin copy. */
  isAdmin: boolean;
  /** Text the user must type exactly: username (subject) or userId (admin). */
  expectedConfirmText: string;
  /** Triggered after countdown elapses; resolves to the cascade summary. */
  onErase: (params: { reasonNote?: string }) => Promise<ErasureResultDto>;
  countdownSeconds?: number;
  /**
   * Called once on the SUMMARY stage so the parent page can wire in
   * post-erasure handling (e.g. logout countdown for the subject flow).
   * The dialog still owns the summary UI itself.
   */
  onErased?: (result: ErasureResultDto) => void;
}

type Stage =
  | { kind: 'CONFIRM' }
  | { kind: 'COUNTDOWN' }
  | { kind: 'DELETING' }
  | { kind: 'SUMMARY'; result: ErasureResultDto };

const REASON_MIN = 10;
const REASON_MAX = 1000;

export function EraseConfirmDialog({
  open,
  onClose,
  isAdmin,
  expectedConfirmText,
  onErase,
  countdownSeconds = 5,
  onErased,
}: EraseConfirmDialogProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'CONFIRM' });
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [ack3, setAck3] = useState(false);
  const [typed, setTyped] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const [error, setError] = useState<string | null>(null);

  // Tick the countdown while in the COUNTDOWN stage.
  useEffect(() => {
    if (stage.kind !== 'COUNTDOWN') return;
    if (secondsLeft <= 0) return;
    const handle = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(handle);
  }, [stage.kind, secondsLeft]);

  const trimmedReason = reasonNote.trim();
  const adminReasonValid = !isAdmin || trimmedReason.length >= REASON_MIN;
  const typedMatches = typed === expectedConfirmText && expectedConfirmText.length > 0;
  const allAcksChecked = ack1 && ack2 && ack3;
  const canContinue = allAcksChecked && typedMatches && adminReasonValid;

  const handleContinue = () => {
    if (!canContinue) return;
    setStage({ kind: 'COUNTDOWN' });
    setSecondsLeft(countdownSeconds);
  };

  const handleDelete = async () => {
    setError(null);
    setStage({ kind: 'DELETING' });
    try {
      const result = await onErase(isAdmin ? { reasonNote: trimmedReason } : {});
      setStage({ kind: 'SUMMARY', result });
      onErased?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Drop back to COUNTDOWN so user can retry without re-checking everything.
      setStage({ kind: 'COUNTDOWN' });
      setSecondsLeft(0);
    }
  };

  const closeDisabled = stage.kind === 'DELETING';

  return (
    <Dialog
      open={open}
      onClose={closeDisabled ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      // Stop accidental dismissals; user must explicitly click Cancel / close.
      slotProps={{ paper: { sx: { border: (theme) => `2px solid ${theme.palette.error.main}` } } }}
    >
      {stage.kind === 'CONFIRM' && (
        <ConfirmStage
          isAdmin={isAdmin}
          expectedConfirmText={expectedConfirmText}
          ack1={ack1}
          ack2={ack2}
          ack3={ack3}
          onAck1={setAck1}
          onAck2={setAck2}
          onAck3={setAck3}
          typed={typed}
          onTyped={setTyped}
          reasonNote={reasonNote}
          onReasonNote={setReasonNote}
          typedMatches={typedMatches}
          adminReasonValid={adminReasonValid}
          onCancel={onClose}
          onContinue={handleContinue}
          canContinue={canContinue}
        />
      )}
      {(stage.kind === 'COUNTDOWN' || stage.kind === 'DELETING') && (
        <CountdownStage
          isAdmin={isAdmin}
          expectedConfirmText={expectedConfirmText}
          secondsLeft={secondsLeft}
          deleting={stage.kind === 'DELETING'}
          error={error}
          onCancel={onClose}
          onDelete={() => {
            void handleDelete();
          }}
        />
      )}
      {stage.kind === 'SUMMARY' && (
        <SummaryStage
          isAdmin={isAdmin}
          result={stage.result}
          onClose={onClose}
          // Subject flow handles its own logout countdown — render no Done button here.
          renderActions={isAdmin}
        />
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Stage 1: CONFIRM
// ---------------------------------------------------------------------------

interface ConfirmStageProps {
  isAdmin: boolean;
  expectedConfirmText: string;
  ack1: boolean;
  ack2: boolean;
  ack3: boolean;
  onAck1: (v: boolean) => void;
  onAck2: (v: boolean) => void;
  onAck3: (v: boolean) => void;
  typed: string;
  onTyped: (v: string) => void;
  reasonNote: string;
  onReasonNote: (v: string) => void;
  typedMatches: boolean;
  adminReasonValid: boolean;
  onCancel: () => void;
  onContinue: () => void;
  canContinue: boolean;
}

function ConfirmStage(props: ConfirmStageProps) {
  const { t: translate } = useTranslation();
  const {
    isAdmin,
    expectedConfirmText,
    ack1,
    ack2,
    ack3,
    onAck1,
    onAck2,
    onAck3,
    typed,
    onTyped,
    reasonNote,
    onReasonNote,
    typedMatches,
    adminReasonValid,
    onCancel,
    onContinue,
    canContinue,
  } = props;

  const reasonTrimmed = reasonNote.trim();
  const reasonHelper = isAdmin
    ? reasonTrimmed.length === 0
      ? translate('admin.users.eraseDialog.reasonRequired')
      : reasonTrimmed.length < REASON_MIN
        ? translate('admin.users.eraseDialog.reasonTooShort')
        : translate('admin.users.eraseDialog.reasonHelper')
    : undefined;

  return (
    <>
      <DialogTitle sx={{ color: 'error.main' }}>
        {isAdmin
          ? translate('admin.users.eraseDialog.title')
          : translate('privacy.eraseDialog.title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="error" variant="filled">
            <AlertTitle>{translate('privacy.eraseDialog.warningTitle')}</AlertTitle>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {isAdmin ? (
                <Trans
                  i18nKey="admin.users.eraseDialog.warningBody"
                  values={{ userId: expectedConfirmText }}
                  components={{ 1: <strong /> }}
                />
              ) : (
                translate('privacy.eraseDialog.warningBody')
              )}
            </Typography>
            <Box component="ul" sx={{ pl: 3, m: 0 }}>
              <li>{translate('privacy.eraseDialog.consequence1')}</li>
              <li>{translate('privacy.eraseDialog.consequence2')}</li>
              <li>{translate('privacy.eraseDialog.consequence3')}</li>
            </Box>
          </Alert>

          {!isAdmin && (
            <Typography variant="body2" color="text.secondary">
              <Trans
                i18nKey="privacy.eraseDialog.noticeExport"
                components={{ 1: <strong /> }}
              />
            </Typography>
          )}

          <Stack spacing={0}>
            <FormControlLabel
              control={<Checkbox checked={ack1} onChange={(e) => onAck1(e.target.checked)} />}
              label={
                isAdmin
                  ? translate('admin.users.eraseDialog.ackResponsibility')
                  : translate('privacy.eraseDialog.ackPermanent')
              }
            />
            <FormControlLabel
              control={<Checkbox checked={ack2} onChange={(e) => onAck2(e.target.checked)} />}
              label={
                isAdmin
                  ? translate('admin.users.eraseDialog.ackPermanent')
                  : translate('privacy.eraseDialog.ackExported')
              }
            />
            <FormControlLabel
              control={<Checkbox checked={ack3} onChange={(e) => onAck3(e.target.checked)} />}
              label={
                isAdmin
                  ? translate('admin.users.eraseDialog.ackAuditLog')
                  : translate('privacy.eraseDialog.ackLogin')
              }
            />
          </Stack>

          {isAdmin && (
            <TextField
              label={translate('admin.users.eraseDialog.reasonLabel')}
              value={reasonNote}
              onChange={(e) => onReasonNote(e.target.value.slice(0, REASON_MAX))}
              multiline
              minRows={3}
              maxRows={6}
              fullWidth
              required
              error={reasonTrimmed.length > 0 && !adminReasonValid}
              helperText={reasonHelper}
              slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
            />
          )}

          <TextField
            label={
              isAdmin
                ? translate('admin.users.eraseDialog.typeUserIdLabel')
                : translate('privacy.eraseDialog.typeUsernameLabel')
            }
            value={typed}
            onChange={(e) => onTyped(e.target.value)}
            fullWidth
            required
            error={typed.length > 0 && !typedMatches}
            helperText={
              typed.length > 0 && !typedMatches
                ? isAdmin
                  ? translate('admin.users.eraseDialog.typeUserIdMismatch')
                  : translate('privacy.eraseDialog.typeUsernameMismatch')
                : isAdmin
                  ? translate('admin.users.eraseDialog.typeUserIdHelper', { userId: expectedConfirmText })
                  : translate('privacy.eraseDialog.typeUsernameHelper', { username: expectedConfirmText })
            }
            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>
          {translate('privacy.eraseDialog.cancelButton')}
        </Button>
        <Button
          onClick={onContinue}
          variant="contained"
          color="error"
          disabled={!canContinue}
        >
          {translate('privacy.eraseDialog.continueButton')}
        </Button>
      </DialogActions>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stage 2: COUNTDOWN (final delete button locked for N seconds)
// ---------------------------------------------------------------------------

interface CountdownStageProps {
  isAdmin: boolean;
  expectedConfirmText: string;
  secondsLeft: number;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onDelete: () => void;
}

function CountdownStage({
  isAdmin,
  expectedConfirmText,
  secondsLeft,
  deleting,
  error,
  onCancel,
  onDelete,
}: CountdownStageProps) {
  const { t: translate } = useTranslation();

  const ready = secondsLeft <= 0;
  const label = deleting
    ? translate('privacy.eraseConfirmDialog.deleting')
    : ready
      ? translate('privacy.eraseConfirmDialog.deleteButton')
      : translate('privacy.eraseConfirmDialog.deleteButtonReady', { seconds: secondsLeft });

  return (
    <>
      <DialogTitle sx={{ color: 'error.main' }}>
        {translate('privacy.eraseConfirmDialog.title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="error" variant="filled">
            {isAdmin ? (
              <Trans
                i18nKey="admin.users.eraseConfirmDialog.body"
                values={{ userId: expectedConfirmText, seconds: secondsLeft }}
                components={{ 1: <strong /> }}
              />
            ) : (
              <Trans
                i18nKey="privacy.eraseConfirmDialog.body"
                values={{ username: expectedConfirmText, seconds: secondsLeft }}
                components={{ 1: <strong /> }}
              />
            )}
          </Alert>
          {error && (
            <Alert severity="error">
              {translate('privacy.eraseConfirmDialog.error', { message: error })}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={deleting}>
          {translate('privacy.eraseDialog.cancelButton')}
        </Button>
        <Button
          onClick={onDelete}
          variant="contained"
          color="error"
          disabled={!ready || deleting}
        >
          {label}
        </Button>
      </DialogActions>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stage 3: SUMMARY (cascade counts + follow-up instructions)
// ---------------------------------------------------------------------------

interface SummaryStageProps {
  isAdmin: boolean;
  result: ErasureResultDto;
  onClose: () => void;
  renderActions: boolean;
}

function SummaryStage({ isAdmin, result, onClose, renderActions }: SummaryStageProps) {
  const { t: translate } = useTranslation();
  return (
    <>
      <DialogTitle>
        {isAdmin
          ? translate('admin.users.erasedSummary.title')
          : translate('privacy.erasedSummary.title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {translate('privacy.erasedSummary.subtitle')}
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <li>
              {translate('privacy.erasedSummary.eventsDeleted', { count: result.eventsDeleted })}
            </li>
            <li>
              {translate('privacy.erasedSummary.projectionsDeleted', { count: result.projectionsDeleted })}
            </li>
            <li>
              {translate('privacy.erasedSummary.categoriesDeleted', { count: result.categoriesDeleted })}
            </li>
            <li>
              {translate('privacy.erasedSummary.keycloakDeleted', {
                state: result.keycloakDeleted
                  ? translate('privacy.erasedSummary.keycloakDeletedYes')
                  : translate('privacy.erasedSummary.keycloakDeletedNo'),
              })}
            </li>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {translate('privacy.erasedSummary.occurredAt', {
              time: new Date(result.occurredAt).toLocaleString(),
            })}
          </Typography>
          {result.followUpInstructions.length > 0 && (
            <>
              <Typography variant="subtitle2">
                {translate('privacy.erasedSummary.followUpTitle')}
              </Typography>
              <Box component="ul" sx={{ pl: 3, m: 0 }}>
                {result.followUpInstructions.map((instruction, idx) => (
                  <li key={idx}>{instruction}</li>
                ))}
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      {renderActions && (
        <DialogActions>
          <Button onClick={onClose} variant="contained">
            {translate('admin.users.erasedSummary.doneButton')}
          </Button>
        </DialogActions>
      )}
    </>
  );
}
