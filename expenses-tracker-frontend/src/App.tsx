import { ThemeProvider, CssBaseline } from '@mui/material';
import { Route, Routes } from 'react-router-dom';
import { ColorModeToggleContext, useColorTheme } from './theme.ts';
import { Layout } from './components/Layout.tsx';
import CategoriesPage from './pages/CategoriesPage.tsx';
import TransactionsPage from './pages/TransactionsPage.tsx';
import OverviewPage from './pages/OverviewPage.tsx';
import AddExpensePage from './pages/AddExpensePage.tsx';

function App() {
  const [theme, colorModeToggle] = useColorTheme();

  return (
    <ColorModeToggleContext.Provider value={colorModeToggle}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<CategoriesPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/add" element={<AddExpensePage />} />
          </Route>
        </Routes>
      </ThemeProvider>
    </ColorModeToggleContext.Provider>
  );
}

export default App;
