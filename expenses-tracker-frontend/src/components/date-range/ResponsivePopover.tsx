import Dialog from '@mui/material/Dialog';
import Popover from '@mui/material/Popover';
import type { ReactNode } from 'react';
import { SlideUp } from '../transitions/SlideUp.tsx';

/**
 * Renders the same content as a slide-up bottom sheet on mobile and as
 * a popover anchored to `anchorEl` on desktop. Used by the date-range
 * preset menu and the day/range pickers so each call site can stay
 * agnostic of the responsive switch.
 */
interface ResponsivePopoverProps {
  open: boolean;
  isMobile: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  /** Override the popover paper width (desktop only). */
  desktopWidth?: number | string;
  /** Override the popover paper padding (desktop only). */
  desktopPaperSx?: object;
  /** Bottom-sheet styling for mobile dialogs. Defaults to standard sheet. */
  mobileSheet?: boolean;
  children: ReactNode;
}

const BOTTOM_SHEET_PAPER_SX = {
  position: 'fixed' as const,
  bottom: 0,
  m: 0,
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  width: '100%',
  maxWidth: 480,
  p: 2,
};

const FULL_WIDTH_PAPER_SX = {
  width: '100%',
  maxWidth: '100%',
  m: 0,
  px: 2,
};

/**
 * Renders the same content as a slide-up bottom sheet on mobile and as a
 * popover anchored to `anchorEl` on desktop. Used by the date range and
 * day/range pickers.
 */
export function ResponsivePopover({
  open,
  isMobile,
  anchorEl,
  onClose,
  desktopWidth = 420,
  desktopPaperSx,
  mobileSheet = false,
  children,
}: ResponsivePopoverProps) {
  if (isMobile) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        slots={mobileSheet ? { transition: SlideUp } : undefined}
        slotProps={{
          paper: { sx: mobileSheet ? BOTTOM_SHEET_PAPER_SX : FULL_WIDTH_PAPER_SX },
        }}
        sx={
          mobileSheet
            ? { '& .MuiDialog-container': { alignItems: 'flex-end' } }
            : undefined
        }
      >
        {children}
      </Dialog>
    );
  }
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      slotProps={{
        paper: {
          sx: { px: 2, width: desktopWidth, maxWidth: '100%', ...desktopPaperSx },
        },
      }}
    >
      {children}
    </Popover>
  );
}
