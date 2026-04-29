import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import { DateCalendar } from '@mui/x-date-pickers';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { calendarSx } from './calendarSx.ts';

/** Which side of the range the calendar is currently editing. */
export type RangeStep = 'from' | 'to';

/**
 * Two-step range picker: pick `from`, then `to`. Auto-swaps when the
 * user picks `to` < `from` so the parent always receives a valid range.
 */
interface RangePickerPanelProps {
  rangeStep: RangeStep;
  pendingFrom: Dayjs | null;
  pendingTo: Dayjs | null;
  onStepChange: (step: RangeStep) => void;
  onDayPick: (d: Dayjs | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RangePickerPanel({
  rangeStep,
  pendingFrom,
  pendingTo,
  onStepChange,
  onDayPick,
  onCancel,
  onConfirm,
}: RangePickerPanelProps) {
  const { t: translate } = useTranslation();
  return (
    <>
      <Box sx={{ pt: 2 }}>
        <Typography variant="h6" fontWeight={600} textAlign="center">
          {rangeStep === 'from'
            ? translate('dateRange.selectStart')
            : translate('dateRange.selectEnd')}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1 }}>
          <RangeStepLabel
            label={pendingFrom ? pendingFrom.format('MMM D, YYYY') : '—'}
            active={rangeStep === 'from'}
            onClick={() => onStepChange('from')}
          />
          <Typography variant="body2" sx={{ py: 0.5 }}>–</Typography>
          <RangeStepLabel
            label={pendingTo ? pendingTo.format('MMM D, YYYY') : '—'}
            active={rangeStep === 'to'}
            onClick={() => onStepChange('to')}
          />
        </Box>
      </Box>
      <DateCalendar
        value={rangeStep === 'from' ? pendingFrom : pendingTo}
        onChange={onDayPick}
        sx={calendarSx}
      />
      <DialogActions>
        <Button onClick={onCancel}>{translate('common.cancel')}</Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={!pendingFrom || !pendingTo}
        >
          {translate('common.apply')}
        </Button>
      </DialogActions>
    </>
  );
}

interface RangeStepLabelProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function RangeStepLabel({ label, active, onClick }: RangeStepLabelProps) {
  return (
    <Typography
      variant="body2"
      fontWeight={active ? 700 : 400}
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        bgcolor: active ? 'action.selected' : 'transparent',
      }}
    >
      {label}
    </Typography>
  );
}
