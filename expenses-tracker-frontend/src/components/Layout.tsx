import type React from 'react';
import { useContext, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Switch from '@mui/material/Switch';
import Fab from '@mui/material/Fab';
import Chip from '@mui/material/Chip';
import MenuIcon from '@mui/icons-material/Menu';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PieChartIcon from '@mui/icons-material/PieChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BarChartIcon from '@mui/icons-material/BarChart';
import AddIcon from '@mui/icons-material/Add';
import SyncIcon from '@mui/icons-material/Sync';
import CategoryIcon from '@mui/icons-material/Category';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import LogoutIcon from '@mui/icons-material/Logout';
import FormatSizeIcon from '@mui/icons-material/FormatSize';
import LanguageIcon from '@mui/icons-material/Language';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { ColorModeToggleContext, FontScaleContext } from '../theme.ts';
import { useMainCurrency } from '../hooks/useCurrency.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { CurrencyCode } from '../api/exchange.ts';
import { AddExpenseDialog } from './AddExpenseDialog.tsx';
import { ManageCategoriesDialog } from './ManageCategoriesDialog.tsx';
import { CurrencyPickerDialog } from './CurrencyPickerDialog.tsx';
import { FontSizePickerDialog } from './FontSizePickerDialog.tsx';
import { LanguagePickerDialog } from './LanguagePickerDialog.tsx';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { resolveLanguage } from '../i18n/locale.ts';

const DRAWER_WIDTH = 280;

// `labelKey` is typed via i18next module augmentation (see src/i18n/i18next.d.ts):
// `ParseKeys` exposes the union of every leaf key in en.json, so a typo in any
// of the literals below — or in code that calls `translate(item.labelKey)` —
// is a TypeScript compile error rather than a silent missing-translation
// fallback at runtime.
type TranslationKey = ParseKeys;

interface NavItem {
  labelKey: TranslationKey;
  path: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.categories', path: '/', icon: <PieChartIcon /> },
  { labelKey: 'nav.transactions', path: '/transactions', icon: <ReceiptLongIcon /> },
  { labelKey: 'nav.overview', path: '/overview', icon: <BarChartIcon /> },
];

function navIndex(pathname: string): number {
  const idx = NAV_ITEMS.findIndex((n) => n.path === pathname);
  return idx >= 0 ? idx : 0;
}

export function Layout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { t: translate, i18n } = useTranslation();

  const { toggleColorMode } = useContext(ColorModeToggleContext);
  const { fontScale, setFontScale } = useContext(FontScaleContext);
  const isDark = theme.palette.mode === 'dark';
  const { mainCurrency, setMainCurrency } = useMainCurrency();
  const { username, logout } = useAuth();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [fontSizePickerOpen, setFontSizePickerOpen] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  const activeLangCode = resolveLanguage(i18n);
  const activeLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === activeLangCode)?.code.toUpperCase()
    ?? activeLangCode.toUpperCase();

  const activeIdx = navIndex(location.pathname);

  const handleNav = (path: string) => {
    void navigate(path);
    setDrawerOpen(false);
  };

  const navItemSx = (isActive: boolean) => ({
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
  });

  const drawerPaperSx = {
    width: DRAWER_WIDTH,
    boxSizing: 'border-box',
    borderRight: 'none',
    borderTopRightRadius: '6px',
    borderBottomRightRadius: '6px',
    backgroundColor: 'background.paper',
  } as const;

  const renderSectionHeader = (
    label: string,
    open: boolean,
    onToggle: () => void,
  ) => (
    <ListItemButton onClick={onToggle} sx={{ mx: '12px', mt: '15px', mb: '4px', borderRadius: '10px', py: '6px' }}>
      <ListItemText
        primary={label}
        slotProps={{ primary: { variant: 'h6', color: 'text.secondary' } }}
      />
      {open
        ? <ExpandLess sx={{ color: 'text.secondary' }} />
        : <ExpandMore sx={{ color: 'text.secondary' }} />}
    </ListItemButton>
  );

  // Sidebar content shared between permanent & temporary drawer
  const sidebarContent = (
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
            onClick={() => handleNav(item.path)}
            sx={navItemSx(i === activeIdx)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={translate(item.labelKey)} />
          </ListItemButton>
        ))}
      </List>
      {renderSectionHeader(translate('nav.tools'), toolsOpen, () => setToolsOpen((prev) => !prev))}
      <Collapse in={toolsOpen}>
        <List
          disablePadding
          sx={{
            ml: '24px',
            borderLeft: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          }}
        >
          <ListItemButton
            selected={location.pathname === '/sync'}
            onClick={() => handleNav('/sync')}
            sx={navItemSx(location.pathname === '/sync')}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}><SyncIcon /></ListItemIcon>
            <ListItemText primary={translate('nav.sync')} />
          </ListItemButton>
        </List>
      </Collapse>
      {renderSectionHeader(translate('nav.settings'), settingsOpen, () => setSettingsOpen((prev) => !prev))}
      <Collapse in={settingsOpen}>
        <Box
          sx={{
            ml: '24px',
            borderLeft: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          }}
        >
          <ListItemButton
            onClick={toggleColorMode}
            sx={{
              ...navItemSx(false),
              justifyContent: 'space-between',
            }}
          >
            <ListItemText primary={translate('settings.darkMode')} />
            <Switch
              checked={isDark}
              slotProps={{ input: { 'aria-label': translate('settings.toggleDarkMode') } }}
              sx={{ mr: -1 }}
            />
          </ListItemButton>
          <ListItemButton
            onClick={() => { setManageCategoriesOpen(true); setDrawerOpen(false); }}
            sx={navItemSx(false)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><CategoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary={translate('settings.manageCategories')} slotProps={{ primary: { noWrap: true } }} />
          </ListItemButton>
          <ListItemButton
            onClick={() => { setCurrencyPickerOpen(true); setDrawerOpen(false); }}
            sx={navItemSx(false)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><AttachMoneyIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary={translate('settings.currency')} />
            <Chip label={mainCurrency} size="small" variant="outlined" sx={{ ml: 1 }} />
          </ListItemButton>
          <ListItemButton
            onClick={() => { setFontSizePickerOpen(true); setDrawerOpen(false); }}
            sx={navItemSx(false)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><FormatSizeIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary={translate('settings.fontSize')} />
            <Chip label={translate(`settings.fontScale.${fontScale}`)} size="small" variant="outlined" sx={{ ml: 1 }} />
          </ListItemButton>
          <ListItemButton
            onClick={() => { setLanguagePickerOpen(true); setDrawerOpen(false); }}
            sx={navItemSx(false)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><LanguageIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary={translate('settings.language')} />
            <Chip label={activeLangLabel} size="small" variant="outlined" sx={{ ml: 1 }} />
          </ListItemButton>
        </Box>
      </Collapse>

      {/* User section */}
      <Box sx={{ mt: 3, borderTop: `1px solid ${theme.palette.divider}`, pt: 1, pb: 1 }}>
        <ListItemButton
          onClick={logout}
          sx={{ ...navItemSx(false), mx: '12px' }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><LogoutIcon fontSize="medium" /></ListItemIcon>
          <ListItemText
            primary={username}
            slotProps={{ primary: { noWrap: true, variant: 'body1' } }}
          />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100dvh', flexDirection: 'column' }}>
      {/* Mobile top bar */}
      {!isDesktop && (
        <Toolbar
          variant="dense"
          sx={{ backgroundColor: 'background.paper', color: 'text.primary' }}
        >
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 1 }}
            aria-label={translate('nav.openMenu')}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700} noWrap>
            {translate('appName')}
          </Typography>
        </Toolbar>
      )}

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Desktop sidebar */}
        {isDesktop && (
          <Drawer
            variant="permanent"
            sx={{
              width: DRAWER_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': drawerPaperSx,
            }}
          >
            {sidebarContent}
          </Drawer>
        )}

        {/* Mobile drawer */}
        {!isDesktop && (
          <Drawer
            variant="temporary"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            slotProps={{ root: { keepMounted: true } }}
            sx={{
              '& .MuiDrawer-paper': drawerPaperSx,
            }}
          >
            {sidebarContent}
          </Drawer>
        )}

        {/* Page content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            pb: isDesktop ? 2 : '72px', // bottom nav padding on mobile
            px: { xs: 1, sm: 2, md: 3 },
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {/* FAB — add expense */}
      <Fab
        color="primary"
        aria-label={translate('expenses.addAriaLabel')}
        onClick={(e) => {
          // Blur the FAB before the Dialog mounts; otherwise MUI's aria-hidden
          // on #root conflicts with the still-focused trigger button.
          e.currentTarget.blur();
          setAddDialogOpen(true);
        }}
        sx={{
          position: 'fixed',
          right: 16,
          bottom: isDesktop ? 16 : 80,
          zIndex: theme.zIndex.fab,
        }}
      >
        <AddIcon />
      </Fab>

      <AddExpenseDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
      />

      {manageCategoriesOpen && (
        <ManageCategoriesDialog
          open
          onClose={() => setManageCategoriesOpen(false)}
        />
      )}

      {currencyPickerOpen && (
        <CurrencyPickerDialog
          open
          onClose={() => setCurrencyPickerOpen(false)}
          value={mainCurrency}
          onChange={(code) => setMainCurrency(code as CurrencyCode)}
        />
      )}

      {fontSizePickerOpen && (
        <FontSizePickerDialog
          open
          onClose={() => setFontSizePickerOpen(false)}
          value={fontScale}
          onChange={setFontScale}
        />
      )}

      {languagePickerOpen && (
        <LanguagePickerDialog
          open
          onClose={() => setLanguagePickerOpen(false)}
        />
      )}

      {/* Mobile bottom nav */}
      {!isDesktop && (
        <BottomNavigation
          value={activeIdx}
          onChange={(_: React.SyntheticEvent, newValue: number) => handleNav(NAV_ITEMS[newValue].path)}
          showLabels
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: theme.zIndex.appBar,
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          {NAV_ITEMS.map((item) => (
            <BottomNavigationAction
              key={item.path}
              label={translate(item.labelKey)}
              icon={item.icon}
            />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}
