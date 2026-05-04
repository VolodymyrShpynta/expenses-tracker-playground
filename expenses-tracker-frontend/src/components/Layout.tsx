import { useContext, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Fab from '@mui/material/Fab';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { FontScaleContext } from '../theme.ts';
import { useMainCurrency } from '../hooks/useCurrency.ts';
import type { CurrencyCode } from '../api/exchange.ts';
import { AddExpenseDialog } from './AddExpenseDialog.tsx';
import { ManageCategoriesDialog } from './ManageCategoriesDialog.tsx';
import { CurrencyPickerDialog } from './CurrencyPickerDialog.tsx';
import { FontSizePickerDialog } from './FontSizePickerDialog.tsx';
import { LanguagePickerDialog } from './LanguagePickerDialog.tsx';
import { ExportImportDialog } from './ExportImportDialog.tsx';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { resolveLanguage } from '../i18n/locale.ts';
import { NAV_ITEMS, navIndex } from './layout/navItems.tsx';
import { DRAWER_WIDTH, drawerPaperSx } from './layout/layoutStyles.ts';
import { SidebarContent } from './layout/SidebarContent.tsx';

export function Layout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { t: translate, i18n } = useTranslation();

  const { fontScale, setFontScale } = useContext(FontScaleContext);
  const { mainCurrency, setMainCurrency } = useMainCurrency();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [fontSizePickerOpen, setFontSizePickerOpen] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [exportImportOpen, setExportImportOpen] = useState(false);

  const activeLangCode = resolveLanguage(i18n);
  const activeLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === activeLangCode)?.code.toUpperCase() ??
    activeLangCode.toUpperCase();

  const activeIdx = navIndex(location.pathname);

  const handleNav = (path: string) => {
    void navigate(path);
    setDrawerOpen(false);
  };

  // Each settings opener also closes the drawer for a clean mobile flow.
  const openAndCloseDrawer = (open: () => void) => () => {
    open();
    setDrawerOpen(false);
  };

  const sidebarContent = (
    <SidebarContent
      activeIdx={activeIdx}
      onNav={handleNav}
      toolsOpen={toolsOpen}
      onToggleTools={() => setToolsOpen((prev) => !prev)}
      settingsOpen={settingsOpen}
      onToggleSettings={() => setSettingsOpen((prev) => !prev)}
      mainCurrency={mainCurrency}
      activeLangLabel={activeLangLabel}
      fontScale={fontScale}
      onManageCategories={openAndCloseDrawer(() => setManageCategoriesOpen(true))}
      onPickCurrency={openAndCloseDrawer(() => setCurrencyPickerOpen(true))}
      onPickFontSize={openAndCloseDrawer(() => setFontSizePickerOpen(true))}
      onPickLanguage={openAndCloseDrawer(() => setLanguagePickerOpen(true))}
      onExportImport={openAndCloseDrawer(() => setExportImportOpen(true))}
    />
  );

  return (
    <Box sx={{ display: 'flex', height: '100dvh', flexDirection: 'column' }}>
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
        {isDesktop ? (
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
        ) : (
          <Drawer
            variant="temporary"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            slotProps={{ root: { keepMounted: true } }}
            sx={{ '& .MuiDrawer-paper': drawerPaperSx }}
          >
            {sidebarContent}
          </Drawer>
        )}

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

      <AddExpenseDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />

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

      {exportImportOpen && (
        <ExportImportDialog
          open
          onClose={() => setExportImportOpen(false)}
        />
      )}

      {!isDesktop && (
        <BottomNavigation
          value={activeIdx}
          onChange={(_: SyntheticEvent, newValue: number) =>
            handleNav(NAV_ITEMS[newValue].path)
          }
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
