import { createContext, useCallback, useContext, useState } from 'react';
import type { CurrencyCode } from '../api/exchange.ts';

const STORAGE_KEY = 'expenses-tracker-main-currency';
const DEFAULT_CURRENCY: CurrencyCode = 'USD';

interface CurrencyContextValue {
  mainCurrency: CurrencyCode;
  setMainCurrency: (code: CurrencyCode) => void;
}

export const CurrencyContext = createContext<CurrencyContextValue>({
  mainCurrency: DEFAULT_CURRENCY,
  setMainCurrency: () => {},
});

function readStoredCurrency(): CurrencyCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored as CurrencyCode;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_CURRENCY;
}

export function useCurrencyProvider(): CurrencyContextValue {
  const [mainCurrency, setMainCurrencyState] = useState<CurrencyCode>(readStoredCurrency);

  const setMainCurrency = useCallback((code: CurrencyCode) => {
    setMainCurrencyState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch { /* localStorage unavailable */ }
  }, []);

  return { mainCurrency, setMainCurrency };
}

export function useMainCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
