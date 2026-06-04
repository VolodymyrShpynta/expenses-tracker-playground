import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS, ACCOUNT_NAV_ITEMS, ADMIN_NAV_ITEMS, type NavItem } from './navItems';
import { DRAWER_WIDTH, navItemSx } from './layoutStyles';
import {
  SidebarSettings,
  SidebarTools,
  SidebarUserSection,
} from './SidebarSections';
import { useAuth } from '../../context/AuthContext';
import type { FontScale } from '../../theme';

/**
 * Pure-render assembly of the sidebar (header, primary nav, account
 * nav, optional admin nav, Tools and Settings sections, user footer).
 * All state — selection, open/closed sections, dialog triggers — is
 * owned by `Layout` and passed in as props, so the same instance can
 * be rendered inside the permanent desktop drawer or the temporary
 * mobile drawer without duplication.
 */
interface SidebarContentProps {
  activeIdx: number;
  onNav: (path: string) => void;

  toolsOpen: boolean;
  onToggleTools: () => void;

  settingsOpen: boolean;
  onToggleSettings: () => void;

  mainCurrency: string;
  activeLangLabel: string;
  fontScale: FontScale;

  onManageCategories: () => void;
  onPickCurrency: () => void;
  onPickFontSize: () => void;
  onPickLanguage: () => void;
  onExportImport: () => void;
}

const GDPR_ADMIN_ROLE = 'gdpr-admin';

export function SidebarContent(props: SidebarContentProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const location = useLocation();
  const { hasRole } = useAuth();
  const {
    activeIdx,
    onNav,
    toolsOpen,
    onToggleTools,
    settingsOpen,
    onToggleSettings,
    mainCurrency,
    activeLangLabel,
    fontScale,
    onManageCategories,
    onPickCurrency,
    onPickFontSize,
    onPickLanguage,
    onExportImport,
  } = props;

  return (
    <Box sx={{ width: DRAWER_WIDTH }}>
      <Toolbar>
        <Typography variant="h4" fontWeight={700} noWrap>
          {translate('appName')}
        </Typography>
      </Toolbar>
      <List>
        {NAV_ITEMS.map((item, i) => (
          <ListItemButton
            key={item.path}
            selected={i === activeIdx}
            onClick={() => onNav(item.path)}
            sx={navItemSx(theme, i === activeIdx)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={translate(item.labelKey)} />
          </ListItemButton>
        ))}
      </List>

      <SidebarTools
        open={toolsOpen}
        onToggle={onToggleTools}
        onExportImport={onExportImport}
      />

      <SidebarSettings
        open={settingsOpen}
        onToggle={onToggleSettings}
        mainCurrency={mainCurrency}
        activeLangLabel={activeLangLabel}
        fontScale={fontScale}
        onManageCategories={onManageCategories}
        onPickCurrency={onPickCurrency}
        onPickFontSize={onPickFontSize}
        onPickLanguage={onPickLanguage}
      />

      <Divider sx={{ my: 1 }} />
      <SecondaryNavList
        items={ACCOUNT_NAV_ITEMS}
        currentPath={location.pathname}
        onNav={onNav}
      />
      {hasRole(GDPR_ADMIN_ROLE) && (
        <SecondaryNavList
          items={ADMIN_NAV_ITEMS}
          currentPath={location.pathname}
          onNav={onNav}
        />
      )}

      <SidebarUserSection />
    </Box>
  );
}

interface SecondaryNavListProps {
  items: NavItem[];
  currentPath: string;
  onNav: (path: string) => void;
}

function SecondaryNavList({ items, currentPath, onNav }: SecondaryNavListProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  return (
    <List dense>
      {items.map((item) => {
        const active = item.path === currentPath;
        return (
          <ListItemButton
            key={item.path}
            selected={active}
            onClick={() => onNav(item.path)}
            sx={navItemSx(theme, active)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={translate(item.labelKey)} />
          </ListItemButton>
        );
      })}
    </List>
  );
}
