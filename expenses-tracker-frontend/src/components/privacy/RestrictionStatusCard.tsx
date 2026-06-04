/**
 * Read-only status card for the current restriction (subject or admin
 * variant). The headline + restriction-detail rows + action button are
 * the only things that change between subject and admin contexts, so
 * those are passed in by the caller.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { RestrictionDto } from '../../types/privacy';

interface RestrictionStatusCardProps {
  restriction: RestrictionDto | null | undefined;
  loading: boolean;
  error: string | null;
  /** Headline above the status. Defaults to the subject-side copy. */
  statusActiveText?: string;
  statusNoneText?: string;
  /** Triggered when no restriction is active. */
  onRestrictClick: () => void;
  /** Triggered when a restriction is active. */
  onLiftClick: () => void;
  restrictButtonLabel: string;
  liftButtonLabel: string;
}

export function RestrictionStatusCard({
  restriction,
  loading,
  error,
  statusActiveText,
  statusNoneText,
  onRestrictClick,
  onLiftClick,
  restrictButtonLabel,
  liftButtonLabel,
}: RestrictionStatusCardProps) {
  const { t: translate } = useTranslation();

  if (loading) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          {translate('privacy.restriction.loading')}
        </Typography>
      </Stack>
    );
  }

  if (error) {
    return <Alert severity="error">{translate('privacy.restriction.error', { message: error })}</Alert>;
  }

  if (!restriction) {
    return (
      <Stack spacing={2}>
        <Alert severity="success" variant="outlined">
          {statusNoneText ?? translate('privacy.restriction.statusNone')}
        </Alert>
        <Box>
          <Button variant="contained" color="warning" onClick={onRestrictClick}>
            {restrictButtonLabel}
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Alert severity="warning" variant="outlined">
        {statusActiveText ?? translate('privacy.restriction.statusActive')}
      </Alert>
      <Stack spacing={1} divider={<Divider flexItem />}>
        <DetailRow
          label={translate('privacy.restriction.fieldGround')}
          value={translate(`privacy.restrictDialog.grounds.${restriction.ground}`)}
        />
        <DetailRow
          label={translate('privacy.restriction.fieldAppliedAt')}
          value={dayjs(restriction.restrictedAt).format('YYYY-MM-DD HH:mm')}
        />
        <DetailRow
          label={translate('privacy.restriction.fieldRequestedBy')}
          value={restriction.requestedBy}
        />
        {restriction.reasonNote && (
          <DetailRow label={translate('privacy.restriction.fieldReason')} value={restriction.reasonNote} multiline />
        )}
        {restriction.liftNoticeSentAt && (
          <DetailRow
            label={translate('privacy.restriction.fieldLiftNoticeSentAt')}
            value={dayjs(restriction.liftNoticeSentAt).format('YYYY-MM-DD HH:mm')}
          />
        )}
      </Stack>
      <Box>
        <Button variant="outlined" color="primary" onClick={onLiftClick}>
          {liftButtonLabel}
        </Button>
      </Box>
    </Stack>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  multiline?: boolean;
}

function DetailRow({ label, value, multiline }: DetailRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: multiline ? 'column' : { xs: 'column', sm: 'row' },
        gap: multiline ? 0.5 : { xs: 0.5, sm: 2 },
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 180 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>
        {value}
      </Typography>
    </Box>
  );
}
