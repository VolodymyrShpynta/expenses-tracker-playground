import type React from 'react';
import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AppBar from '@mui/material/AppBar';
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
import Fab from '@mui/material/Fab';
import Divider from '@mui/material/Divider';
import MenuIcon from '@mui/icons-material/Menu';
import PieChartIcon from '@mui/icons-material/PieChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BarChartIcon from '@mui/icons-material/BarChart';
import AddIcon from '@mui/icons-material/Add';
import SyncIcon from '@mui/icons-material/Sync';
import { ColorModeToggle } from './ColorModeToggle.tsx';

const DRAWER_WIDTH = 240;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Categories', path: '/', icon: <PieChartIcon /> },
  { label: 'Transactions', path: '/transactions', icon: <ReceiptLongIcon /> },
  { label: 'Overview', path: '/overview', icon: <BarChartIcon /> },
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

  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeIdx = navIndex(location.pathname);

  const handleNav = (path: string) => {
    void navigate(path);
    setDrawerOpen(false);
  };

  // Sidebar content shared between permanent & temporary drawer
  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH }}>
      <Toolbar>
        <Typography variant="h6" fontWeight={700} noWrap>
          Expenses Tracker
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {NAV_ITEMS.map((item, i) => (
          <ListItemButton
            key={item.path}
            selected={i === activeIdx}
            onClick={() => handleNav(item.path)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <List>
        <ListItemButton onClick={() => handleNav('/sync')}>
          <ListItemIcon><SyncIcon /></ListItemIcon>
          <ListItemText primary="Sync" />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100dvh', flexDirection: 'column' }}>
      {/* App bar */}
      <AppBar
        position="fixed"
        elevation={1}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
        }}
      >
        <Toolbar variant="dense">
          {!isDesktop && (
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => setDrawerOpen(true)}
              sx={{ mr: 1 }}
              aria-label="Open menu"
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" fontWeight={700} noWrap sx={{ flexGrow: 1 }}>
            Expenses Tracker
          </Typography>
          <ColorModeToggle />
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1, pt: '48px' /* dense toolbar height */ }}>
        {/* Desktop sidebar */}
        {isDesktop && (
          <Drawer
            variant="permanent"
            sx={{
              width: DRAWER_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: DRAWER_WIDTH,
                boxSizing: 'border-box',
                mt: '48px',
              },
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
              '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
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
        aria-label="Add expense"
        onClick={() => handleNav('/add')}
        sx={{
          position: 'fixed',
          right: 16,
          bottom: isDesktop ? 16 : 80,
          zIndex: theme.zIndex.fab,
        }}
      >
        <AddIcon />
      </Fab>

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
              label={item.label}
              icon={item.icon}
            />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}
