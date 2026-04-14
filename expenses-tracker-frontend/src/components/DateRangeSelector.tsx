import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Slide from '@mui/material/Slide';
import Grid from '@mui/material/Grid';
import ButtonBase from '@mui/material/ButtonBase';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TodayIcon from '@mui/icons-material/Today';
import DateRangeIcon from '@mui/icons-material/DateRange';
import Filter7Icon from '@mui/icons-material/Filter7';
import Looks6Icon from '@mui/icons-material/Looks6';
import { DateCalendar } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { TransitionProps } from '@mui/material/transitions';
import { forwardRef } from 'react';
import type { PresetKey } from '../utils/dateRange.ts';
import {
  buildWeekRange,
  buildMonthRange,
  buildYearRange,
  buildTodayRange,
  buildAllTimeRange,
  readStoredPreset,
  savePreset,
  formatShort,
  formatRange,
  startOfDay,
  endOfDay,
} from '../utils/dateRange.ts';
import type { DateRange } from '../utils/dateRange.ts';

// ---------------------------------------------------------------------------
// Slide-up transition for the bottom sheet
// ---------------------------------------------------------------------------

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// ---------------------------------------------------------------------------
// Calendar style overrides for range highlighting
// ---------------------------------------------------------------------------

const calendarSx = {
  width: '100%',
  '& .MuiPickersCalendarHeader-root': { mt: 1 },
  '& .MuiDayCalendar-weekDayLabel': { fontSize: '0.75rem' },
  '& .MuiPickersDay-root': { fontSize: '0.8rem' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

type PickerMode = 'none' | 'day' | 'range';
type RangeStep = 'from' | 'to';

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const [activePreset, setActivePresetState] = useState<PresetKey>(readStoredPreset);
  const setActivePreset = useCallback((key: PresetKey) => {
    setActivePresetState(key);
    savePreset(key);
  }, []);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [pickerAnchorEl, setPickerAnchorEl] = useState<HTMLElement | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>('none');
  const [rangeStep, setRangeStep] = useState<RangeStep>('from');
  const [pendingFrom, setPendingFrom] = useState<Dayjs | null>(null);
  const [pendingTo, setPendingTo] = useState<Dayjs | null>(null);
  const [pendingDay, setPendingDay] = useState<Dayjs | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const open = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  // Subtitle shown under each preset card
  const subtitles = useMemo(() => {
    const now = new Date();
    const week = buildWeekRange();
    return {
      range: `${formatShort(value.from)} – ${formatShort(value.to)}`,
      all: '',
      day: '',
      week: `${formatShort(week.from)} – ${formatShort(week.to)}`,
      today: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
      year: `Year ${now.getFullYear()}`,
      month: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, [value]);

  // Shift logic for arrow navigation
  const shiftAmount = useCallback((): { unit: 'day' | 'month' | 'year'; count: number } => {
    switch (activePreset) {
      case 'today': return { unit: 'day', count: 1 };
      case 'week': return { unit: 'day', count: 7 };
      case 'month': return { unit: 'month', count: 1 };
      case 'year': return { unit: 'year', count: 1 };
      default: return { unit: 'month', count: 1 };
    }
  }, [activePreset]);

  const shift = useCallback(
    (direction: -1 | 1) => {
      if (activePreset === 'range' || activePreset === 'all' || activePreset === 'day') return;
      const from = new Date(value.from);
      const to = new Date(value.to);
      const { unit, count } = shiftAmount();
      const delta = direction * count;
      if (unit === 'day') {
        from.setDate(from.getDate() + delta);
        to.setDate(to.getDate() + delta);
      } else if (unit === 'month') {
        from.setMonth(from.getMonth() + delta);
        from.setDate(1);
        to.setFullYear(from.getFullYear(), from.getMonth() + 1, 0);
        to.setHours(23, 59, 59, 999);
      } else {
        from.setFullYear(from.getFullYear() + delta);
        to.setFullYear(to.getFullYear() + delta);
      }
      onChange({ from, to });
    },
    [value, onChange, activePreset, shiftAmount],
  );

  const canShift = activePreset !== 'range' && activePreset !== 'all' && activePreset !== 'day';

  const selectPreset = (key: PresetKey) => {
    setActivePreset(key);
    switch (key) {
      case 'week': onChange(buildWeekRange()); handleClose(); break;
      case 'month': onChange(buildMonthRange()); handleClose(); break;
      case 'year': onChange(buildYearRange()); handleClose(); break;
      case 'today': onChange(buildTodayRange()); handleClose(); break;
      case 'all': onChange(buildAllTimeRange()); handleClose(); break;
      case 'day':
        setPickerAnchorEl(anchorEl);
        handleClose();
        setPendingDay(dayjs(value.from));
        setTimeout(() => setPickerMode('day'), 200);
        break;
      case 'range':
        setPickerAnchorEl(anchorEl);
        handleClose();
        setPendingFrom(dayjs(value.from));
        setPendingTo(dayjs(value.to));
        setRangeStep('from');
        setTimeout(() => setPickerMode('range'), 200);
        break;
    }
  };

  const closePicker = () => {
    setPickerMode('none');
    setPickerAnchorEl(null);
  };

  const handleDayPick = (d: Dayjs | null) => {
    if (d) setPendingDay(d);
  };

  const handleDayConfirm = () => {
    if (pendingDay) {
      const date = pendingDay.toDate();
      onChange({ from: startOfDay(date), to: endOfDay(date) });
    }
    closePicker();
  };

  const handleRangeCalendarChange = (d: Dayjs | null) => {
    if (!d) return;
    if (rangeStep === 'from') {
      setPendingFrom(d);
      // If new "from" is after current "to", reset "to" to same day
      if (pendingTo && d.isAfter(pendingTo)) setPendingTo(d);
      setRangeStep('to');
    } else {
      // If picked "to" is before "from", swap them
      if (pendingFrom && d.isBefore(pendingFrom)) {
        setPendingTo(pendingFrom);
        setPendingFrom(d);
      } else {
        setPendingTo(d);
      }
    }
  };

  const handleRangeConfirm = () => {
    if (pendingFrom && pendingTo) {
      onChange({ from: startOfDay(pendingFrom.toDate()), to: endOfDay(pendingTo.toDate()) });
    }
    closePicker();
  };

  // Preset card definitions
  const presetCards: Array<{
    key: PresetKey;
    label: string;
    icon: React.ReactNode;
    fullWidth?: boolean;
  }> = [
    { key: 'range', label: 'Select range', icon: <MoreHorizIcon />, fullWidth: true },
    { key: 'all', label: 'All time', icon: <AllInclusiveIcon /> },
    { key: 'day', label: 'Select day', icon: <CalendarMonthIcon /> },
    { key: 'week', label: 'Week', icon: <Filter7Icon /> },
    { key: 'today', label: 'Today', icon: <TodayIcon /> },
    { key: 'year', label: 'Year', icon: <Looks6Icon sx={{ transform: 'scaleX(-1)' }} /> },
    { key: 'month', label: 'Month', icon: <DateRangeIcon /> },
  ];

  // Shared content for both Popover and Dialog
  const panelContent = (
    <>
      <Typography variant="h6" fontWeight={600} textAlign="center" sx={{ mb: 2 }}>
        Period
      </Typography>

      <Grid container spacing={1}>
        {presetCards.map((card) => (
          <Grid key={card.key} size={card.fullWidth ? 12 : 6}>
            <ButtonBase
              onClick={() => selectPreset(card.key)}
              sx={{
                width: '100%',
                borderRadius: 2,
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                bgcolor: activePreset === card.key ? 'action.selected' : 'action.hover',
                transition: 'background-color 0.2s',
                '&:hover': { bgcolor: 'action.selected' },
              }}
            >
              {card.icon}
              <Typography variant="body2" fontWeight={600}>
                {card.label}
              </Typography>
              {subtitles[card.key] && (
                <Typography variant="caption" color="text.secondary">
                  {subtitles[card.key]}
                </Typography>
              )}
            </ButtonBase>
          </Grid>
        ))}
      </Grid>
    </>
  );

  // Shared range picker content for both Popover and Dialog
  const rangePickerContent = (
    <>
      <Box sx={{ pt: 2 }}>
        <Typography variant="h6" fontWeight={600} textAlign="center">
          {rangeStep === 'from' ? 'Select start date' : 'Select end date'}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 1,
            mt: 1,
          }}
        >
          <Typography
            variant="body2"
            fontWeight={rangeStep === 'from' ? 700 : 400}
            onClick={() => setRangeStep('from')}
            sx={{
              cursor: 'pointer',
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              bgcolor: rangeStep === 'from' ? 'action.selected' : 'transparent',
            }}
          >
            {pendingFrom ? pendingFrom.format('MMM D, YYYY') : '—'}
          </Typography>
          <Typography variant="body2" sx={{ py: 0.5 }}>–</Typography>
          <Typography
            variant="body2"
            fontWeight={rangeStep === 'to' ? 700 : 400}
            onClick={() => setRangeStep('to')}
            sx={{
              cursor: 'pointer',
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              bgcolor: rangeStep === 'to' ? 'action.selected' : 'transparent',
            }}
          >
            {pendingTo ? pendingTo.format('MMM D, YYYY') : '—'}
          </Typography>
        </Box>
      </Box>
      <DateCalendar
        value={rangeStep === 'from' ? pendingFrom : pendingTo}
        onChange={handleRangeCalendarChange}
        sx={calendarSx}
      />
      <DialogActions>
        <Button onClick={closePicker}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleRangeConfirm}
          disabled={!pendingFrom || !pendingTo}
        >
          Apply
        </Button>
      </DialogActions>
    </>
  );

  return (
    <Box sx={{ py: 1 }}>
      {/* Header bar with arrows + date label */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
        }}
      >
        {canShift && (
          <IconButton onClick={() => shift(-1)} aria-label="Previous period">
            <ChevronLeftIcon fontSize="medium" />
          </IconButton>
        )}
        <Typography
          variant="subtitle1"
          fontWeight={600}
          onClick={handleOpen}
          sx={{
            minWidth: 240,
            textAlign: 'center',
            cursor: 'pointer',
            letterSpacing: '0.02em',
            '&:hover': { opacity: 0.7 },
          }}
        >
          {formatRange(value)}
        </Typography>
        {canShift && (
          <IconButton onClick={() => shift(1)} aria-label="Next period">
            <ChevronRightIcon fontSize="medium" />
          </IconButton>
        )}
      </Box>

      {/* Mobile: bottom sheet dialog */}
      {isMobile ? (
        <Dialog
          open={open}
          onClose={handleClose}
          slots={{ transition: SlideUp }}
          slotProps={{
            paper: {
              sx: {
                position: 'fixed',
                bottom: 0,
                m: 0,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                width: '100%',
                maxWidth: 480,
                p: 2,
              },
            },
          }}
          sx={{
            '& .MuiDialog-container': {
              alignItems: 'flex-end',
            },
          }}
        >
          {panelContent}
        </Dialog>
      ) : (
        /* Desktop: popover anchored to the date label */
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          slotProps={{ paper: { sx: { p: 2, maxWidth: 420 } } }}
        >
          {panelContent}
        </Popover>
      )}

      {/* Day picker */}
      {isMobile ? (
        <Dialog
          open={pickerMode === 'day'}
          onClose={closePicker}
          sx={{ '& .MuiDialog-paper': { maxWidth: 360, mx: 3, px: 2, width: '100%' } }}
        >
          <Typography variant="h6" fontWeight={600} textAlign="center" sx={{ pt: 2 }}>
            Pick a day
          </Typography>
          <DateCalendar value={pendingDay} onChange={handleDayPick} sx={calendarSx} />
          <DialogActions>
            <Button onClick={closePicker}>Cancel</Button>
            <Button variant="contained" onClick={handleDayConfirm}>Ok</Button>
          </DialogActions>
        </Dialog>
      ) : (
        <Popover
          open={pickerMode === 'day'}
          anchorEl={pickerAnchorEl}
          onClose={closePicker}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          slotProps={{ paper: { sx: { px: 2, maxWidth: 360 } } }}
        >
          <Typography variant="h6" fontWeight={600} textAlign="center" sx={{ pt: 2 }}>
            Pick a day
          </Typography>
          <DateCalendar value={pendingDay} onChange={handleDayPick} sx={calendarSx} />
          <DialogActions>
            <Button onClick={closePicker}>Cancel</Button>
            <Button variant="contained" onClick={handleDayConfirm}>Ok</Button>
          </DialogActions>
        </Popover>
      )}

      {/* Range picker */}
      {isMobile ? (
        <Dialog
          open={pickerMode === 'range'}
          onClose={closePicker}
          sx={{ '& .MuiDialog-paper': { maxWidth: 360, mx: 3, px: 2, width: '100%' } }}
        >
          {rangePickerContent}
        </Dialog>
      ) : (
        <Popover
          open={pickerMode === 'range'}
          anchorEl={pickerAnchorEl}
          onClose={closePicker}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          slotProps={{ paper: { sx: { px: 2, maxWidth: 360 } } }}
        >
          {rangePickerContent}
        </Popover>
      )}
    </Box>
  );
}
