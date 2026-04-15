import { createContext, useCallback, useContext, useState } from 'react';
import type { CurrencyCode } from '../api/exchange.ts';
import { useAuth } from '../context/AuthContext.tsx';

const STORAGE_KEY_PREFIX = 'expenses-tracker-main-currency';
const DEFAULT_CURRENCY: CurrencyCode = 'USD';

interface CurrencyContextValue {
  mainCurrency: CurrencyCode;
  setMainCurrency: (code: CurrencyCode) => void;
}

export const CurrencyContext = createContext<CurrencyContextValue>({
  mainCurrency: DEFAULT_CURRENCY,
  setMainCurrency: () => {},
});

function readStoredCurrency(userId: string): CurrencyCode {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${userId}`);
    if (stored) return stored as CurrencyCode;
  } catch (e) { console.warn('Failed to read currency from localStorage', e); }
  return DEFAULT_CURRENCY;
}

export function useCurrencyProvider(): CurrencyContextValue {
  const { userId } = useAuth();
  const [mainCurrency, setMainCurrencyState] = useState<CurrencyCode>(() => readStoredCurrency(userId));

  const setMainCurrency = useCallback((code: CurrencyCode) => {
    setMainCurrencyState(code);
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}:${userId}`, code);
    } catch (e) { console.warn('Failed to save currency to localStorage', e); }
  }, [userId]);

  return { mainCurrency, setMainCurrency };
}

export function useMainCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
