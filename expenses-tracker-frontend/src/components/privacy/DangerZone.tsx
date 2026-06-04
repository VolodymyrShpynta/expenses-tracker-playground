/**
 * Collapsible "Danger zone" wrapper for destructive controls. The
 * accordion summary uses an error-tinted background so the section is
 * impossible to miss, and the content is collapsed by default so
 * nothing inside can be triggered with an accidental tap.
 */
import type { ReactNode } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface DangerZoneProps {
  title: string;
  dangerLabel: string;
  explainer: string;
  children: ReactNode;
}

export function DangerZone({ title, dangerLabel, explainer, children }: DangerZoneProps) {
  return (
    <Accordion
      disableGutters
      sx={(theme) => ({
        border: `1px solid ${theme.palette.error.main}`,
        borderRadius: 1,
        backgroundColor:
          theme.palette.mode === 'dark'
            ? `${theme.palette.error.dark}15`
            : `${theme.palette.error.light}15`,
        '&::before': { display: 'none' },
      })}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <WarningAmberIcon color="error" />
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
          <Chip
            size="small"
            color="error"
            label={dangerLabel}
            icon={<WarningAmberIcon />}
            sx={{ ml: 1 }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {explainer}
          </Typography>
          {children}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
