import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { NAV_ITEMS } from './navItems.tsx';
import { DRAWER_WIDTH, navItemSx } from './layoutStyles.ts';
import {
  SidebarSettings,
  SidebarTools,
  SidebarUserSection,
} from './SidebarSections.tsx';
import type { FontScale } from '../../theme.ts';

/**
 * Pure-render assembly of the sidebar (header, primary nav, Tools and
 * Settings sections, user footer). All state — selection, open/closed
 * sections, dialog triggers — is owned by `Layout` and passed in as
 * props, so the same instance can be rendered inside the permanent
 * desktop drawer or the temporary mobile drawer without duplication.
 */
interface SidebarContentProps {
  activeIdx: number;
  currentPath: string;
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

export function SidebarContent(props: SidebarContentProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const {
    activeIdx,
    currentPath,
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
        onNav={onNav}
        currentPath={currentPath}
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

      <SidebarUserSection />
    </Box>
  );
}
