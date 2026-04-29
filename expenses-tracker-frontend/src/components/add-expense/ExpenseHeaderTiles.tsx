import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import { useTheme } from '@mui/material/styles';
import type { RefObject } from 'react';

interface ExpenseTileProps {
  label: string;
  value: string;
  color: string;
  onClick: (el: HTMLElement) => void;
}

/**
 * One of the two header tiles in the AddExpenseDialog (Date / Category).
 * Renders a coloured tappable card with a label and a value; foreground
 * colour is derived from the background for guaranteed contrast.
 */
export function ExpenseTile({ label, value, color, onClick }: ExpenseTileProps) {
  const theme = useTheme();
  const textColor = theme.palette.getContrastText(color);
  return (
    <ButtonBase
      onClick={(e) => onClick(e.currentTarget)}
      sx={{
        flex: 1,
        p: 2,
        borderRadius: 2,
        bgcolor: color,
        color: textColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        textAlign: 'left',
        minHeight: 84,
        transition: 'filter 150ms',
        '&:hover': { filter: 'brightness(1.05)' },
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.85, mb: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
        {value}
      </Typography>
    </ButtonBase>
  );
}

interface ExpenseHeaderTilesProps {
  /** Anchor element for date-pickers that prefer to attach to the Date tile. */
  dateTileRef: RefObject<HTMLDivElement | null>;
  dateLabel: string;
  dateValue: string;
  dateColor: string;
  onOpenDate: (el: HTMLElement) => void;
  categoryLabel: string;
  categoryValue: string;
  categoryColor: string;
  onOpenCategory: () => void;
}

/**
 * Side-by-side Date / Category header tiles in the AddExpenseDialog.
 * The Date tile carries an external `ref` because the date popover
 * anchors to it even when the user opens it via the keypad shortcut.
 */
export function ExpenseHeaderTiles({
  dateTileRef,
  dateLabel,
  dateValue,
  dateColor,
  onOpenDate,
  categoryLabel,
  categoryValue,
  categoryColor,
  onOpenCategory,
}: ExpenseHeaderTilesProps) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Box ref={dateTileRef} sx={{ flex: 1, display: 'flex' }}>
        <ExpenseTile
          label={dateLabel}
          value={dateValue}
          color={dateColor}
          onClick={onOpenDate}
        />
      </Box>
      <ExpenseTile
        label={categoryLabel}
        value={categoryValue}
        color={categoryColor}
        onClick={() => onOpenCategory()}
      />
    </Box>
  );
}
