/**
 * `/admin/users` — operator GDPR console.
 *
 * Requires the `gdpr-admin` realm role; the route component renders a
 * permission-denied panel rather than redirecting silently so the user
 * understands why they can't see anything.
 *
 * Workflow:
 *   1. Operator pastes a Keycloak `sub` (UUID) into the lookup field
 *      and clicks Load. There is no list endpoint — IDs come from the
 *      Keycloak admin console.
 *   2. Once a userId is loaded, we render the same restriction and
 *      erasure widgets used by the subject page, but with admin
 *      variants (mandatory reason notes, typed-confirm against
 *      userId instead of username, no logout after success).
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  useUserRestriction,
  useRestrictUser,
  useLiftUserRestriction,
  useEraseUser,
} from '../hooks/useUserPrivacy';
import { RestrictionStatusCard } from '../components/privacy/RestrictionStatusCard';
import { RestrictDialog } from '../components/privacy/RestrictDialog';
import { LiftRestrictionDialog } from '../components/privacy/LiftRestrictionDialog';
import { DangerZone } from '../components/privacy/DangerZone';
import { EraseConfirmDialog } from '../components/privacy/EraseConfirmDialog';

const GDPR_ADMIN_ROLE = 'gdpr-admin';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AdminUsersPage() {
  const { t: translate } = useTranslation();
  const { hasRole } = useAuth();

  if (!hasRole(GDPR_ADMIN_ROLE)) {
    return (
      <Box sx={{ py: 4, px: 1, maxWidth: 720, mx: 'auto' }}>
        <Alert severity="error">
          {translate('admin.users.pageTitle')} — required role: <code>{GDPR_ADMIN_ROLE}</code>
        </Alert>
      </Box>
    );
  }

  return <AdminUsersPageContent />;
}

function AdminUsersPageContent() {
  const { t: translate } = useTranslation();

  const [lookupInput, setLookupInput] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [restrictOpen, setRestrictOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);

  const trimmedLookup = lookupInput.trim();
  const lookupValid = UUID_PATTERN.test(trimmedLookup);

  const restriction = useUserRestriction(selectedUserId ?? '', selectedUserId !== null);
  const restrictMutation = useRestrictUser(selectedUserId ?? '');
  const liftMutation = useLiftUserRestriction(selectedUserId ?? '');
  const eraseMutation = useEraseUser(selectedUserId ?? '');

  const handleLoad = () => {
    if (lookupValid) {
      setSelectedUserId(trimmedLookup);
    }
  };

  const handleClear = () => {
    setSelectedUserId(null);
    setLookupInput('');
  };

  return (
    <Box sx={{ py: 2, px: 1, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        {translate('admin.users.pageTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {translate('admin.users.pageSubtitle')}
      </Typography>

      <Stack spacing={3}>
        {/* ── Lookup ──────────────────────────────────────────────────── */}
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" gutterBottom fontWeight={600}>
            {translate('admin.users.lookup.title')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
            <TextField
              label={translate('admin.users.lookup.label')}
              placeholder={translate('admin.users.lookup.placeholder')}
              helperText={translate('admin.users.lookup.helper')}
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              error={trimmedLookup.length > 0 && !lookupValid}
              fullWidth
              slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
            />
            <Stack direction="row" spacing={1} sx={{ pt: { sm: 1 } }}>
              <Button
                variant="contained"
                onClick={handleLoad}
                disabled={!lookupValid}
              >
                {translate('admin.users.lookup.loadButton')}
              </Button>
              <Button
                variant="text"
                onClick={handleClear}
                disabled={!selectedUserId && lookupInput.length === 0}
              >
                {translate('admin.users.lookup.clearButton')}
              </Button>
            </Stack>
          </Stack>

          {selectedUserId && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Trans
                i18nKey="admin.users.lookup.selectedLabel"
                values={{ userId: selectedUserId }}
                components={{ 1: <code style={{ fontFamily: 'monospace' }} /> }}
              />
            </Alert>
          )}
        </Paper>

        {/* ── Restriction (only after a user is loaded) ───────────────── */}
        {selectedUserId && (
          <>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                {translate('admin.users.restriction.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {translate('admin.users.restriction.reasonRequiredHelper')}
              </Typography>
              <RestrictionStatusCard
                restriction={restriction.data}
                loading={restriction.isLoading}
                error={restriction.error?.message ?? null}
                statusActiveText={translate('admin.users.restriction.restrictedHeadline', {
                  userId: selectedUserId,
                })}
                statusNoneText={translate('admin.users.restriction.noneHeadline', {
                  userId: selectedUserId,
                })}
                onRestrictClick={() => setRestrictOpen(true)}
                onLiftClick={() => setLiftOpen(true)}
                restrictButtonLabel={translate('admin.users.restriction.restrictButton')}
                liftButtonLabel={translate('admin.users.restriction.liftButton')}
              />
            </Paper>

            <DangerZone
              title={translate('admin.users.erasure.title')}
              dangerLabel={translate('admin.users.erasure.dangerLabel')}
              explainer={translate('admin.users.erasure.explainer')}
            >
              <Box>
                <Button variant="outlined" color="error" onClick={() => setEraseOpen(true)}>
                  {translate('admin.users.erasure.openButton')}
                </Button>
              </Box>
            </DangerZone>
          </>
        )}
      </Stack>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      {selectedUserId && (
        <>
          {restrictOpen && (
            <RestrictDialog
              open
              onClose={() => setRestrictOpen(false)}
              isAdmin
              onSubmit={async (req) => {
                if (!req.reasonNote) {
                  throw new Error(translate('admin.users.restrictDialog.reasonRequired'));
                }
                await restrictMutation.mutateAsync({ ground: req.ground, reasonNote: req.reasonNote });
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
              isAdmin
              expectedConfirmText={selectedUserId}
              onErase={async ({ reasonNote }) => {
                if (!reasonNote) {
                  throw new Error(translate('admin.users.eraseDialog.reasonRequired'));
                }
                return eraseMutation.mutateAsync({ reasonNote });
              }}
              onErased={() => {
                // Admin-initiated erasure: keep the operator logged in, just clear the selection
                // after they dismiss the summary so the page returns to the lookup state.
                setSelectedUserId(null);
                setLookupInput('');
              }}
            />
          )}
        </>
      )}
    </Box>
  );
}
