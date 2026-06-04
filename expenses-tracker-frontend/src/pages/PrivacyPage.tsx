/**
 * `/account/privacy` — the subject-facing GDPR self-service page.
 *
 * Sections:
 *   1. "Your account" identification panel.
 *   2. Article 18 restriction status + apply/lift dialogs.
 *   3. Article 17 erasure danger zone, with the paranoid confirm
 *      dialog. On success the dialog hands the cascade summary to
 *      `AuthContext.signalErasureComplete(...)`, which replaces the
 *      entire app subtree with `PostErasureScreen` and counts down to
 *      a forced sign-out. The countdown is hoisted out of this page
 *      on purpose — keeping it here would let the user dodge the
 *      logout by simply clicking a sidebar item, which unmounts the
 *      page and kills the timer while the JWT (still cryptographically
 *      valid until expiry) keeps accepting writes against the
 *      now-orphan user id.
 *
 * Article 15 (access) and Article 20 (portability) are not duplicated
 * here — the existing Export & Import dialog in the sidebar Tools
 * section already covers them. We just link to it via the i18n
 * `yourData.exportHint` blurb.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  useMyRestriction,
  useRestrictMyself,
  useLiftMyRestriction,
  useEraseMyself,
} from '../hooks/useUserPrivacy';
import { RestrictionStatusCard } from '../components/privacy/RestrictionStatusCard';
import { RestrictDialog } from '../components/privacy/RestrictDialog';
import { LiftRestrictionDialog } from '../components/privacy/LiftRestrictionDialog';
import { DangerZone } from '../components/privacy/DangerZone';
import { EraseConfirmDialog } from '../components/privacy/EraseConfirmDialog';

export default function PrivacyPage() {
  const { t: translate } = useTranslation();
  const { username, userId, signalErasureComplete } = useAuth();
  const navigate = useNavigate();

  const restriction = useMyRestriction();
  const restrictMutation = useRestrictMyself();
  const liftMutation = useLiftMyRestriction();
  const eraseMutation = useEraseMyself();

  const [restrictOpen, setRestrictOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);

  return (
    <Box sx={{ py: 2, px: 1, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        {translate('privacy.pageTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {translate('privacy.pageSubtitle')}
      </Typography>

      <Stack spacing={3}>
        {/* ── Your account ─────────────────────────────────────────────── */}
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" gutterBottom fontWeight={600}>
            {translate('privacy.yourData.title')}
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <KeyValue label={translate('privacy.yourData.username')} value={username} />
            <KeyValue label={translate('privacy.yourData.userId')} value={userId} mono />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            <Trans
              i18nKey="privacy.yourData.exportHint"
              components={{
                1: (
                  <Box
                    component="span"
                    sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => {
                      // Navigate home and let the user open Tools → Export/Import from the sidebar.
                      // No deep link exists today.
                      void navigate('/');
                    }}
                  />
                ),
              }}
            />
          </Typography>
        </Paper>

        {/* ── Article 18 — restriction ─────────────────────────────────── */}
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" gutterBottom fontWeight={600}>
            {translate('privacy.restriction.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {translate('privacy.restriction.explainer')}
          </Typography>
          <RestrictionStatusCard
            restriction={restriction.data}
            loading={restriction.isLoading}
            error={restriction.error?.message ?? null}
            onRestrictClick={() => setRestrictOpen(true)}
            onLiftClick={() => setLiftOpen(true)}
            restrictButtonLabel={translate('privacy.restriction.restrictButton')}
            liftButtonLabel={translate('privacy.restriction.liftButton')}
          />
        </Paper>

        {/* ── Article 17 — erasure (danger zone) ───────────────────────── */}
        <DangerZone
          title={translate('privacy.erasure.title')}
          dangerLabel={translate('privacy.erasure.dangerLabel')}
          explainer={translate('privacy.erasure.explainer')}
        >
          <Box>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setEraseOpen(true)}
            >
              {translate('privacy.erasure.openButton')}
            </Button>
          </Box>
        </DangerZone>
      </Stack>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      {restrictOpen && (
        <RestrictDialog
          open
          onClose={() => setRestrictOpen(false)}
          isAdmin={false}
          onSubmit={async (req) => {
            await restrictMutation.mutateAsync(req);
          }}
        />
      )}

      {liftOpen && (
        <LiftRestrictionDialog
          open
          onClose={() => setLiftOpen(false)}
          existingLiftAvailableAt={restriction.data?.liftAvailableAt ?? null}
          onLift={async () => liftMutation.mutateAsync()}
        />
      )}

      {eraseOpen && (
        <EraseConfirmDialog
          open
          onClose={() => setEraseOpen(false)}
          isAdmin={false}
          expectedConfirmText={username}
          onErase={async () => eraseMutation.mutateAsync()}
          onErased={(result) => {
            // Hand the cascade summary to AuthContext, which replaces
            // the entire app subtree with PostErasureScreen and forces
            // sign-out. Closing the dialog locally just clears our
            // own state — by the time React re-renders, AuthContext
            // will already be showing the lockout instead of this page.
            signalErasureComplete(result);
            setEraseOpen(false);
          }}
        />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface KeyValueProps {
  label: string;
  value: string;
  mono?: boolean;
}

function KeyValue({ label, value, mono }: KeyValueProps) {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Box>
  );
}
