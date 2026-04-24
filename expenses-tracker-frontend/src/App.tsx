import { ThemeProvider, CssBaseline } from '@mui/material';
import { Route, Routes } from 'react-router-dom';
import { ColorModeToggleContext, FontScaleContext, useColorTheme } from './theme.ts';
import { CurrencyContext, useCurrencyProvider } from './hooks/useCurrency.ts';
import { DateRangeContext, useDateRangeProvider } from './hooks/useDateRange.ts';
import { LocalizedDateProvider } from './i18n/LocalizedDateProvider.tsx';
import { Layout } from './components/Layout.tsx';
import CategoriesPage from './pages/CategoriesPage.tsx';
import TransactionsPage from './pages/TransactionsPage.tsx';
import OverviewPage from './pages/OverviewPage.tsx';

function AppContent() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<CategoriesPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/overview" element={<OverviewPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  const [theme, colorModeToggle, fontScaleControl] = useColorTheme();
  const currencyValue = useCurrencyProvider();
  const dateRangeValue = useDateRangeProvider();

  return (
    <ColorModeToggleContext.Provider value={colorModeToggle}>
      <FontScaleContext.Provider value={fontScaleControl}>
        <CurrencyContext.Provider value={currencyValue}>
          <DateRangeContext.Provider value={dateRangeValue}>
            <ThemeProvider theme={theme}>
              <CssBaseline />
              <LocalizedDateProvider>
                <AppContent />
              </LocalizedDateProvider>
            </ThemeProvider>
          </DateRangeContext.Provider>
        </CurrencyContext.Provider>
      </FontScaleContext.Provider>
    </ColorModeToggleContext.Provider>
  );
}

export default App;
