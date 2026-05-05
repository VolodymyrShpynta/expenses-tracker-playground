import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useTranslation } from 'react-i18next';
import {
  buildWeekRange,
  formatRange,
  formatShort,
  type DateRange,
  type PresetKey,
} from '../utils/dateRange';
import { PresetGrid } from './date-range/PresetGrid';
import { DayPickerPanel } from './date-range/DayPickerPanel';
import { RangePickerPanel } from './date-range/RangePickerPanel';
import { ResponsivePopover } from './date-range/ResponsivePopover';
import { useDateRangeState } from './date-range/useDateRangeState';

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  onPresetChange?: (preset: PresetKey) => void;
}

export function DateRangeSelector({ value, onChange, onPresetChange }: DateRangeSelectorProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const state = useDateRangeState({ value, onChange, onPresetChange });

  // Subtitle shown under each preset card
  const subtitles = useMemo(() => {
    const now = new Date();
    const week = buildWeekRange();
    return {
      range: `${formatShort(value.from)} – ${formatShort(value.to)}`,
      all: '',
      day: '',
      week: `${formatShort(week.from)} – ${formatShort(week.to)}`,
      today: now.toLocaleDateString(i18n.language, { month: 'long', day: 'numeric' }),
      year: translate('dateRange.year', { year: now.getFullYear() }),
      month: now.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }),
    };
  }, [value, i18n.language, translate]);

  const handleSelectPreset = (key: PresetKey) => {
    const anchor = anchorEl;
    handleClose();
    state.selectPreset(key, anchor);
  };

  return (
    <Box sx={{ py: 1 }}>
      <DateHeader
        label={formatRange(value)}
        canShift={state.canShift}
        onPrev={() => state.shift(-1)}
        onNext={() => state.shift(1)}
        onOpen={handleOpen}
        prevAriaLabel={translate('dateRange.prevPeriodAria')}
        nextAriaLabel={translate('dateRange.nextPeriodAria')}
      />

      <ResponsivePopover
        open={open}
        isMobile={isMobile}
        anchorEl={anchorEl}
        onClose={handleClose}
        mobileSheet
      >
        <PresetGrid
          activePreset={state.activePreset}
          subtitles={subtitles}
          onSelect={handleSelectPreset}
        />
      </ResponsivePopover>

      <ResponsivePopover
        open={state.pickerMode === 'day'}
        isMobile={isMobile}
        anchorEl={state.pickerAnchorEl}
        onClose={state.closePicker}
      >
        <DayPickerPanel
          pendingDay={state.pendingDay}
          onPick={state.handleDayPick}
          onCancel={state.closePicker}
          onConfirm={state.handleDayConfirm}
        />
      </ResponsivePopover>

      <ResponsivePopover
        open={state.pickerMode === 'range'}
        isMobile={isMobile}
        anchorEl={state.pickerAnchorEl}
        onClose={state.closePicker}
      >
        <RangePickerPanel
          rangeStep={state.rangeStep}
          pendingFrom={state.pendingFrom}
          pendingTo={state.pendingTo}
          onStepChange={state.setRangeStep}
          onDayPick={state.handleRangeCalendarChange}
          onCancel={state.closePicker}
          onConfirm={state.handleRangeConfirm}
        />
      </ResponsivePopover>
    </Box>
  );
}

interface DateHeaderProps {
  label: string;
  canShift: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpen: (e: MouseEvent<HTMLElement>) => void;
  prevAriaLabel: string;
  nextAriaLabel: string;
}

function DateHeader({
  label,
  canShift,
  onPrev,
  onNext,
  onOpen,
  prevAriaLabel,
  nextAriaLabel,
}: DateHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}
    >
      {canShift && (
        <IconButton onClick={onPrev} aria-label={prevAriaLabel}>
          <ChevronLeftIcon fontSize="medium" />
        </IconButton>
      )}
      <Typography
        variant="subtitle1"
        fontWeight={600}
        onClick={onOpen}
        sx={{
          minWidth: 240,
          textAlign: 'center',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          '&:hover': { opacity: 0.7 },
        }}
      >
        {label}
      </Typography>
      {canShift && (
        <IconButton onClick={onNext} aria-label={nextAriaLabel}>
          <ChevronRightIcon fontSize="medium" />
        </IconButton>
      )}
    </Box>
  );
}
