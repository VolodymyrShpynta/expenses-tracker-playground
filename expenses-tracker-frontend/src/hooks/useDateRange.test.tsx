import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const useAuthMock = vi.fn();
vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => useAuthMock(),
}));

const { useDateRangeProvider } = await import('./useDateRange.ts');

describe('useDateRangeProvider', () => {
  it('initialises preset from "year" when nothing is stored', () => {
    useAuthMock.mockReturnValue({ userId: 'u1' });

    const { result } = renderHook(() => useDateRangeProvider());

    expect(result.current.preset).toBe('year');
    expect(result.current.dateRange.from.getMonth()).toBe(0);
    expect(result.current.dateRange.to.getMonth()).toBe(11);
  });

  it('persists the chosen preset to localStorage scoped per user', () => {
    useAuthMock.mockReturnValue({ userId: 'u1' });

    const { result } = renderHook(() => useDateRangeProvider());

    act(() => result.current.setPreset('today'));

    expect(result.current.preset).toBe('today');
    expect(localStorage.getItem('expenses-tracker-period-preset:u1')).toBe('today');
  });

  it('reads the previously stored preset on mount', () => {
    localStorage.setItem('expenses-tracker-period-preset:u1', 'month');
    useAuthMock.mockReturnValue({ userId: 'u1' });

    const { result } = renderHook(() => useDateRangeProvider());

    expect(result.current.preset).toBe('month');
    expect(result.current.dateRange.from.getDate()).toBe(1);
  });

  it('keeps presets independent per user id', () => {
    localStorage.setItem('expenses-tracker-period-preset:u1', 'today');
    localStorage.setItem('expenses-tracker-period-preset:u2', 'month');

    useAuthMock.mockReturnValue({ userId: 'u2' });
    const { result } = renderHook(() => useDateRangeProvider());

    expect(result.current.preset).toBe('month');
  });

  it('exposes setDateRange that updates the dateRange state', () => {
    useAuthMock.mockReturnValue({ userId: 'u1' });
    const { result } = renderHook(() => useDateRangeProvider());

    const next = { from: new Date(2026, 5, 1), to: new Date(2026, 5, 30) };
    act(() => result.current.setDateRange(next));

    expect(result.current.dateRange).toEqual(next);
  });
});
