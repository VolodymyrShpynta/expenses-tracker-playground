import { useContext } from 'react';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { ColorModeToggleContext } from '../theme.ts';

export function ColorModeToggle() {
  const theme = useTheme();
  const { toggleColorMode } = useContext(ColorModeToggleContext);
  const isDark = theme.palette.mode === 'dark';

  return (
    <IconButton onClick={toggleColorMode} color="inherit" aria-label="Toggle theme">
      {isDark ? <LightModeIcon /> : <DarkModeIcon />}
    </IconButton>
  );
}
