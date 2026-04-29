import { alpha, type Theme } from '@mui/material/styles';

/**
 * Shared styling constants for the Layout sidebar. Kept in a separate
 * `.ts` file (no JSX) so React Fast Refresh sees the consuming
 * components as "only exports components" — the rule that flagged
 * earlier when these lived alongside the JSX they styled.
 */

export const DRAWER_WIDTH = 280;

/** Pill-style sidebar nav-item styling shared by all rows in the drawer. */
export function navItemSx(theme: Theme, isActive: boolean) {
  return {
    py: '10px',
    my: '4px',
    mx: '12px',
    borderRadius: '10px',
    color: 'text.primary',
    transition: 'background-color 120ms ease, color 120ms ease',
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.12),
      color: 'primary.light',
    },
    ...(isActive && {
      backgroundColor: alpha(theme.palette.primary.main, 0.14),
      color: 'primary.light',
      boxShadow: `inset 0 0 0 1.5px ${alpha(theme.palette.primary.main, 0.4)}`,
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, 0.2),
      },
    }),
  };
}

export const drawerPaperSx = {
  width: DRAWER_WIDTH,
  boxSizing: 'border-box' as const,
  borderRight: 'none',
  borderTopRightRadius: '6px',
  borderBottomRightRadius: '6px',
  backgroundColor: 'background.paper',
} as const;
