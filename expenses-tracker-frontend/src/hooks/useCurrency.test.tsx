import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const useAuthMock = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

const { useCurrencyProvider } = await import('./useCurrency');

describe('useCurrencyProvider', () => {
  it('defaults to USD when nothing is stored', () => {
    useAuthMock.mockReturnValue({ userId: 'u1' });

    const { result } = renderHook(() => useCurrencyProvider());

    expect(result.current.mainCurrency).toBe('USD');
  });

  it('persists the chosen currency to localStorage scoped per user', () => {
    useAuthMock.mockReturnValue({ userId: 'u1' });

    const { result } = renderHook(() => useCurrencyProvider());

    act(() => result.current.setMainCurrency('EUR'));

    expect(result.current.mainCurrency).toBe('EUR');
    expect(localStorage.getItem('expenses-tracker-main-currency:u1')).toBe('EUR');
  });

  it('reads the previously stored currency on mount', () => {
    localStorage.setItem('expenses-tracker-main-currency:u1', 'CZK');
    useAuthMock.mockReturnValue({ userId: 'u1' });

    const { result } = renderHook(() => useCurrencyProvider());

    expect(result.current.mainCurrency).toBe('CZK');
  });

  it('keeps currencies independent per user id', () => {
    localStorage.setItem('expenses-tracker-main-currency:u1', 'EUR');
    localStorage.setItem('expenses-tracker-main-currency:u2', 'GBP');

    useAuthMock.mockReturnValue({ userId: 'u2' });
    const { result } = renderHook(() => useCurrencyProvider());

    expect(result.current.mainCurrency).toBe('GBP');
  });
});
