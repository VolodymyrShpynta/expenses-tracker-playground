/**
 * Two-step dialog for Article 18(3) restriction lift.
 *
 * Step 1: send a pre-lift notice → backend returns 202 with
 * `liftAvailableAt` (a short dwell to give the subject time to react).
 * Step 2: once the dwell has elapsed, the same DELETE call returns 204
 * and actually lifts the restriction. The dialog keeps a countdown
 * timer ticking while waiting, and disables the second button until
 * the timer hits zero.
 */
import { useEffect, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { LiftOutcome } from '../../types/privacy';

interface LiftRestrictionDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Triggered for both step 1 and step 2; the backend distinguishes by
   * the dwell state on its side and returns the matching outcome.
   */
  onLift: () => Promise<LiftOutcome>;
  /**
   * Server-computed deadline for the actual lift, as an ISO instant.
   * When non-null we skip step 1 and jump straight to the countdown —
   * this lets the dialog survive a page refresh without re-sending
   * the Art. 18(3) notice. The value is the authoritative source of
   * truth (computed from `liftNoticeSentAt + configured-dwell` by the
   * backend) so the UI never needs to know the dwell.
   */
  existingLiftAvailableAt?: string | null;
}

type Phase =
  | { kind: 'IDLE' }
  | { kind: 'SENDING' }
  | { kind: 'AWAITING'; liftAvailableAt: string }
  | { kind: 'FINALISING' }
  | { kind: 'DONE' };

export function LiftRestrictionDialog({
  open,
  onClose,
  onLift,
  existingLiftAvailableAt,
}: LiftRestrictionDialogProps) {
  const { t: translate } = useTranslation();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(existingLiftAvailableAt));
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Heartbeat for the countdown while awaiting.
  useEffect(() => {
    if (phase.kind !== 'AWAITING') {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [phase.kind]);

  const secondsRemaining =
    phase.kind === 'AWAITING'
      ? Math.max(0, Math.ceil((new Date(phase.liftAvailableAt).getTime() - now) / 1000))
      : 0;

  const handleStep1 = async () => {
    setError(null);
    setPhase({ kind: 'SENDING' });
    try {
      const out = await onLift();
      if (out.kind === 'NOTICE_SENT') {
        setPhase({ kind: 'AWAITING', liftAvailableAt: out.liftAvailableAt });
      } else {
        setPhase({ kind: 'DONE' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase({ kind: 'IDLE' });
    }
  };

  const handleStep2 = async () => {
    setError(null);
    setPhase({ kind: 'FINALISING' });
    try {
      await onLift();
      setPhase({ kind: 'DONE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Stay in AWAITING so the user can retry.
      if (phase.kind === 'FINALISING') {
        // We don't have liftAvailableAt anymore on this branch; fall back to IDLE so the user can re-send.
        setPhase({ kind: 'IDLE' });
      }
    }
  };

  const closeDisabled = phase.kind === 'SENDING' || phase.kind === 'FINALISING';

  return (
    <Dialog open={open} onClose={closeDisabled ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {phase.kind === 'DONE'
          ? translate('privacy.liftDialog.doneTitle')
          : translate('privacy.liftDialog.title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {phase.kind === 'DONE' ? (
            <Alert severity="success">{translate('privacy.liftDialog.doneBody')}</Alert>
          ) : (
            <DialogContentText>{translate('privacy.liftDialog.body')}</DialogContentText>
          )}
          {phase.kind === 'AWAITING' && (
            <Alert severity="info">
              {translate('privacy.liftDialog.step1Done', {
                time: dayjs(phase.liftAvailableAt).format('HH:mm:ss'),
              })}
            </Alert>
          )}
          {error && <Alert severity="error">{translate('privacy.liftDialog.error', { message: error })}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={closeDisabled}>
          {translate('privacy.liftDialog.close')}
        </Button>
        {phase.kind === 'IDLE' && (
          <Button
            onClick={() => {
              void handleStep1();
            }}
            variant="contained"
          >
            {translate('privacy.liftDialog.step1Button')}
          </Button>
        )}
        {phase.kind === 'SENDING' && (
          <Button variant="contained" disabled>
            {translate('privacy.liftDialog.step1Sending')}
          </Button>
        )}
        {phase.kind === 'AWAITING' && (
          <Button
            onClick={() => {
              void handleStep2();
            }}
            variant="contained"
            disabled={secondsRemaining > 0}
          >
            {secondsRemaining > 0
              ? translate('privacy.liftDialog.step2DisabledHint', { seconds: secondsRemaining })
              : translate('privacy.liftDialog.step2Button')}
          </Button>
        )}
        {phase.kind === 'FINALISING' && (
          <Button variant="contained" disabled>
            {translate('privacy.liftDialog.step2Submitting')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function initialPhase(existingLiftAvailableAt: string | null | undefined): Phase {
  if (!existingLiftAvailableAt) return { kind: 'IDLE' };
  const liftAvailableMs = new Date(existingLiftAvailableAt).getTime();
  if (Number.isNaN(liftAvailableMs)) return { kind: 'IDLE' };
  return { kind: 'AWAITING', liftAvailableAt: existingLiftAvailableAt };
}
