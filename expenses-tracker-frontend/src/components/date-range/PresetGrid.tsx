import type { ReactNode } from 'react';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import ButtonBase from '@mui/material/ButtonBase';
import { useTranslation } from 'react-i18next';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TodayIcon from '@mui/icons-material/Today';
import DateRangeIcon from '@mui/icons-material/DateRange';
import Filter7Icon from '@mui/icons-material/Filter7';
import Looks6Icon from '@mui/icons-material/Looks6';
import type { PresetKey } from '../../utils/dateRange';

interface PresetCard {
  key: PresetKey;
  label: string;
  icon: ReactNode;
  /** When true, the card spans both columns (used for the `range` preset). */
  fullWidth?: boolean;
}

interface PresetGridProps {
  activePreset: PresetKey;
  /** Localised secondary line shown under each card (e.g. "Apr 1 – Apr 7"). */
  subtitles: Record<PresetKey, string>;
  onSelect: (key: PresetKey) => void;
}

/**
 * 2-column grid of preset chips that drives the date-range selector.
 * Pure presentational: parent owns selection state and emits the picked
 * preset back via `onSelect`.
 */
export function PresetGrid({ activePreset, subtitles, onSelect }: PresetGridProps) {
  const { t: translate } = useTranslation();
  const presetCards: PresetCard[] = [
    { key: 'range', label: translate('dateRange.presets.range'), icon: <MoreHorizIcon />, fullWidth: true },
    { key: 'all', label: translate('dateRange.presets.all'), icon: <AllInclusiveIcon /> },
    { key: 'day', label: translate('dateRange.presets.day'), icon: <CalendarMonthIcon /> },
    { key: 'week', label: translate('dateRange.presets.week'), icon: <Filter7Icon /> },
    { key: 'today', label: translate('dateRange.presets.today'), icon: <TodayIcon /> },
    { key: 'year', label: translate('dateRange.presets.year'), icon: <Looks6Icon sx={{ transform: 'scaleX(-1)' }} /> },
    { key: 'month', label: translate('dateRange.presets.month'), icon: <DateRangeIcon /> },
  ];

  return (
    <>
      <Typography variant="h6" fontWeight={600} textAlign="center" sx={{ mb: 2 }}>
        {translate('dateRange.period')}
      </Typography>
      <Grid container spacing={1}>
        {presetCards.map((card) => (
          <Grid key={card.key} size={card.fullWidth ? 12 : 6}>
            <ButtonBase
              onClick={() => onSelect(card.key)}
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
}
