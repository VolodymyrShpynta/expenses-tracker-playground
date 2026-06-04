/**
 * Full-screen lockout shown after a successful self-erasure. Mounted
 * at the top of the React tree by `AuthProvider`, replacing the rest
 * of the app entirely while a countdown forces sign-out.
 *
 * Why a top-level replacement (and not a Dialog inside `PrivacyPage`)?
 * The JWT remains cryptographically valid until it expires, so until
 * Keycloak rejects it the backend will happily accept further writes
 * under the now-orphan user id. A Dialog inside one route gets
 * unmounted the moment the user navigates away, killing the logout
 * timer and leaving the app fully usable. Replacing the entire app
 * subtree means:
 *
 *   * no router is rendered → no navigation possible,
 *   * the post-erasure summary is the only thing on screen, and
 *   * the auto-logout timer's lifecycle matches the lockout itself.
 */
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { useTranslation, Trans } from 'react-i18next';
import type { ErasureResultDto } from '../../types/privacy';

const LOGOUT_COUNTDOWN_SECONDS = 10;

interface PostErasureScreenProps {
  result: ErasureResultDto;
  username: string;
  onLogout: () => void;
}

export function PostErasureScreen({ result, username, onLogout }: PostErasureScreenProps) {
  const { t: translate } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(LOGOUT_COUNTDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onLogout();
      return;
    }
    const handle = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(handle);
  }, [secondsLeft, onLogout]);

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        py: 4,
        px: 2,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 720 }}>
        <Alert severity="success" variant="filled" sx={{ mb: 3 }}>
          <AlertTitle>{translate('privacy.erasedSummary.title')}</AlertTitle>
          <Trans
            i18nKey="privacy.eraseConfirmDialog.body"
            values={{ username, seconds: 0 }}
            components={{ 1: <strong /> }}
          />
        </Alert>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {translate('privacy.erasedSummary.subtitle')}
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <li>{translate('privacy.erasedSummary.eventsDeleted', { count: result.eventsDeleted })}</li>
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
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            {translate('privacy.erasedSummary.occurredAt', {
              time: new Date(result.occurredAt).toLocaleString(),
            })}
          </Typography>

          {result.followUpInstructions.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">
                {translate('privacy.erasedSummary.followUpTitle')}
              </Typography>
              <Box component="ul" sx={{ pl: 3, m: 0 }}>
                {result.followUpInstructions.map((instruction, idx) => (
                  <li key={idx}>{instruction}</li>
                ))}
              </Box>
            </Box>
          )}
        </Paper>

        <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end">
          <Typography variant="body2" color="text.secondary">
            {translate('privacy.erasedSummary.logoutCountdown', { seconds: secondsLeft })}
          </Typography>
          <Button variant="contained" onClick={onLogout}>
            {translate('privacy.erasedSummary.logoutNow')}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
