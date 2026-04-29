import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import { DateCalendar } from '@mui/x-date-pickers';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { calendarSx } from './calendarSx.ts';

/**
 * Single-day picker panel used by both the mobile bottom sheet and the
 * desktop popover variants of the date-range selector.
 */
interface DayPickerPanelProps {
  pendingDay: Dayjs | null;
  onPick: (d: Dayjs | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DayPickerPanel({
  pendingDay,
  onPick,
  onCancel,
  onConfirm,
}: DayPickerPanelProps) {
  const { t: translate } = useTranslation();
  return (
    <>
      <Typography variant="h6" fontWeight={600} textAlign="center" sx={{ pt: 2 }}>
        {translate('dateRange.pickDay')}
      </Typography>
      <DateCalendar value={pendingDay} onChange={onPick} sx={calendarSx} />
      <DialogActions>
        <Button onClick={onCancel}>{translate('common.cancel')}</Button>
        <Button variant="contained" onClick={onConfirm}>
          {translate('common.ok')}
        </Button>
      </DialogActions>
    </>
  );
}
