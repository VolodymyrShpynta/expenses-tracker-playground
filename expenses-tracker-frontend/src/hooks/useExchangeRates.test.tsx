import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { Expense } from '../types/expense';
import { renderHookWithQuery } from '../test/renderHookWithQuery';

const useMainCurrencyMock = vi.fn();
vi.mock('./useCurrency', () => ({
  useMainCurrency: () => useMainCurrencyMock(),
}));

const { useExchangeRates, useConvertedExpenses } = await import('./useExchangeRates');

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  useMainCurrencyMock.mockReturnValue({ mainCurrency: 'USD', setMainCurrency: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function expense(currency: string, amount: number): Expense {
  return {
    id: crypto.randomUUID(),
    description: '',
    amount,
    currency,
    categoryId: 'cat',
    date: '2026-01-01T00:00:00Z',
    updatedAt: 0,
    deleted: false,
  };
}

describe('useExchangeRates.convert', () => {
  it('returns the original amount when source currency equals main currency', () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ result: 'success', rates: { EUR: 0.9 } }), { status: 200 }),
    );

    const { result } = renderHookWithQuery(() => useExchangeRates());

    // Same currency does not require rates to be loaded
    expect(result.current.convert(12345, 'USD')).toBe(12345);
  });

  it('converts using the inverse of the published rate once rates are loaded', async () => {
    // 1 USD = 0.9 EUR, so 90 EUR = 100 USD
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ result: 'success', rates: { EUR: 0.9, GBP: 0.8 } }), {
        status: 200,
      }),
    );

    const { result } = renderHookWithQuery(() => useExchangeRates());

    await waitFor(() => expect(result.current.ratesLoaded).toBe(true));

    expect(result.current.convert(9000, 'EUR')).toBe(10000);
    expect(result.current.convert(8000, 'GBP')).toBe(10000);
  });

  it('returns the original amount when the source currency has no published rate', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ result: 'success', rates: { EUR: 0.9 } }), { status: 200 }),
    );

    const { result } = renderHookWithQuery(() => useExchangeRates());
    await waitFor(() => expect(result.current.ratesLoaded).toBe(true));

    // GBP not in the rates map → return amount untouched
    expect(result.current.convert(5000, 'GBP')).toBe(5000);
  });

  it('returns the original amount while rates are still loading', () => {
    fetchMock.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    const { result } = renderHookWithQuery(() => useExchangeRates());

    expect(result.current.ratesLoaded).toBe(false);
    expect(result.current.convert(1000, 'EUR')).toBe(1000);
  });
});

describe('useConvertedExpenses', () => {
  it('returns expenses with amounts converted to the main currency', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ result: 'success', rates: { EUR: 0.5 } }), { status: 200 }),
    );

    const expenses = [expense('EUR', 1000), expense('USD', 500)];
    const { result } = renderHookWithQuery(() => useConvertedExpenses(expenses));

    await waitFor(() => {
      // First entry converted from EUR (1000 / 0.5 = 2000), second is already USD
      expect(result.current[0].amount).toBe(2000);
    });
    expect(result.current[1].amount).toBe(500);
  });

  it('does not mutate the original expense objects', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ result: 'success', rates: { EUR: 0.5 } }), { status: 200 }),
    );

    const original = expense('EUR', 1000);
    const expenses = [original];

    const { result } = renderHookWithQuery(() => useConvertedExpenses(expenses));
    await waitFor(() => expect(result.current[0].amount).toBe(2000));

    expect(original.amount).toBe(1000);
    expect(result.current[0]).not.toBe(original);
  });
});
