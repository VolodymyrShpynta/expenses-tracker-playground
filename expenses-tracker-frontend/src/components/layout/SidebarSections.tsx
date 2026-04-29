import { useContext } from 'react';
import type { ReactNode } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Collapse from '@mui/material/Collapse';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import SyncIcon from '@mui/icons-material/Sync';
import CategoryIcon from '@mui/icons-material/Category';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import FormatSizeIcon from '@mui/icons-material/FormatSize';
import LanguageIcon from '@mui/icons-material/Language';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next';
import { ColorModeToggleContext, type FontScale } from '../../theme.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SectionHeader } from './SectionHeader.tsx';
import { navItemSx } from './layoutStyles.ts';

/**
 * The three collapsible/non-collapsible blocks at the bottom of the
 * sidebar. Split out from `SidebarContent` to keep each piece focused
 * on a single concern (Tools nav, Settings list, signed-in user footer)
 * and to keep `SidebarContent` itself as straight-through assembly.
 */

interface SidebarToolsProps {
  open: boolean;
  onToggle: () => void;
  onNav: (path: string) => void;
  currentPath: string;
}

/**
 * Collapsible "Tools" section. Currently exposes the manual sync route
 * only; designed to grow without re-shaping the parent layout.
 */
export function SidebarTools({ open, onToggle, onNav, currentPath }: SidebarToolsProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  return (
    <>
      <SectionHeader label={translate('nav.tools')} open={open} onToggle={onToggle} />
      <Collapse in={open}>
        <List
          disablePadding
          sx={{
            ml: '24px',
            borderLeft: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          }}
        >
          <ListItemButton
            selected={currentPath === '/sync'}
            onClick={() => onNav('/sync')}
            sx={navItemSx(theme, currentPath === '/sync')}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}><SyncIcon /></ListItemIcon>
            <ListItemText primary={translate('nav.sync')} />
          </ListItemButton>
        </List>
      </Collapse>
    </>
  );
}

interface SidebarSettingsProps {
  open: boolean;
  onToggle: () => void;
  mainCurrency: string;
  activeLangLabel: string;
  fontScale: FontScale;
  onManageCategories: () => void;
  onPickCurrency: () => void;
  onPickFontSize: () => void;
  onPickLanguage: () => void;
}

/**
 * Collapsible "Settings" section: dark-mode toggle, category management
 * shortcut, plus pickers for currency, font size, and UI language.
 * Each picker is opened by the parent so this component stays purely
 * presentational.
 */
export function SidebarSettings({
  open,
  onToggle,
  mainCurrency,
  activeLangLabel,
  fontScale,
  onManageCategories,
  onPickCurrency,
  onPickFontSize,
  onPickLanguage,
}: SidebarSettingsProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const { toggleColorMode } = useContext(ColorModeToggleContext);
  const isDark = theme.palette.mode === 'dark';

  return (
    <>
      <SectionHeader label={translate('nav.settings')} open={open} onToggle={onToggle} />
      <Collapse in={open}>
        <Box
          sx={{
            ml: '24px',
            borderLeft: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          }}
        >
          <ListItemButton
            onClick={toggleColorMode}
            sx={{ ...navItemSx(theme, false), justifyContent: 'space-between' }}
          >
            <ListItemText primary={translate('settings.darkMode')} />
            <Switch
              checked={isDark}
              slotProps={{ input: { 'aria-label': translate('settings.toggleDarkMode') } }}
              sx={{ mr: -1 }}
            />
          </ListItemButton>
          <SettingsRow
            icon={<CategoryIcon fontSize="small" />}
            label={translate('settings.manageCategories')}
            onClick={onManageCategories}
            noWrap
          />
          <SettingsRow
            icon={<AttachMoneyIcon fontSize="small" />}
            label={translate('settings.currency')}
            chipLabel={mainCurrency}
            onClick={onPickCurrency}
          />
          <SettingsRow
            icon={<FormatSizeIcon fontSize="small" />}
            label={translate('settings.fontSize')}
            chipLabel={translate(`settings.fontScale.${fontScale}`)}
            onClick={onPickFontSize}
          />
          <SettingsRow
            icon={<LanguageIcon fontSize="small" />}
            label={translate('settings.language')}
            chipLabel={activeLangLabel}
            onClick={onPickLanguage}
          />
        </Box>
      </Collapse>
    </>
  );
}

interface SettingsRowProps {
  icon: ReactNode;
  label: string;
  /** Optional right-aligned chip showing the current value (e.g. "USD", "EN"). */
  chipLabel?: string;
  onClick: () => void;
  /** Force `noWrap` on the label. Used by long strings like "Manage categories". */
  noWrap?: boolean;
}

/** One row inside the Settings section. */
function SettingsRow({ icon, label, chipLabel, onClick, noWrap }: SettingsRowProps) {
  const theme = useTheme();
  return (
    <ListItemButton onClick={onClick} sx={navItemSx(theme, false)}>
      <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={label}
        slotProps={noWrap ? { primary: { noWrap: true } } : undefined}
      />
      {chipLabel != null && (
        <Chip label={chipLabel} size="small" variant="outlined" sx={{ ml: 1 }} />
      )}
    </ListItemButton>
  );
}

/**
 * Footer block at the bottom of the sidebar showing the signed-in
 * username and a sign-out shortcut. Kept separate so it sits below the
 * collapsible Tools / Settings sections regardless of their state.
 */
export function SidebarUserSection() {
  const theme = useTheme();
  const { username, logout } = useAuth();
  return (
    <Box sx={{ mt: 3, borderTop: `1px solid ${theme.palette.divider}`, pt: 1, pb: 1 }}>
      <ListItemButton onClick={logout} sx={{ ...navItemSx(theme, false), mx: '12px' }}>
        <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><LogoutIcon fontSize="medium" /></ListItemIcon>
        <ListItemText
          primary={username}
          slotProps={{ primary: { noWrap: true, variant: 'body1' } }}
        />
      </ListItemButton>
    </Box>
  );
}
