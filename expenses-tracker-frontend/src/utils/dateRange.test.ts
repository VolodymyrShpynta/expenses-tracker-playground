import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/locale', () => ({
  getLocale: () => 'en-US',
}));

const {
  buildAllTimeRange,
  buildMonthRange,
  buildRangeForPreset,
  buildTodayRange,
  buildYearRange,
  endOfDay,
  formatRange,
  formatShort,
  readStoredPreset,
  savePreset,
  startOfDay,
} = await import('./dateRange');

describe('startOfDay / endOfDay', () => {
  it('startOfDay zeroes the time portion', () => {
    const d = new Date(2026, 4, 15, 14, 37, 22, 500);
    const start = startOfDay(d);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('endOfDay snaps to 23:59:59.999', () => {
    const d = new Date(2026, 4, 15, 1, 0, 0, 0);
    const end = endOfDay(d);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe('buildXxxRange builders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday, January 21 2026 — anchor for deterministic expectations.
    vi.setSystemTime(new Date(2026, 0, 21, 10, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buildTodayRange covers a single calendar day', () => {
    const r = buildTodayRange();
    expect(r.from.getDate()).toBe(21);
    expect(r.to.getDate()).toBe(21);
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getHours()).toBe(23);
  });

  it('buildMonthRange spans the first to the last day of the current month', () => {
    const r = buildMonthRange();
    expect(r.from.getMonth()).toBe(0);
    expect(r.from.getDate()).toBe(1);
    expect(r.to.getMonth()).toBe(0);
    expect(r.to.getDate()).toBe(31);
  });

  it('buildYearRange spans Jan 1 to Dec 31 of the current year', () => {
    const r = buildYearRange();
    expect(r.from.getFullYear()).toBe(2026);
    expect(r.from.getMonth()).toBe(0);
    expect(r.from.getDate()).toBe(1);
    expect(r.to.getMonth()).toBe(11);
    expect(r.to.getDate()).toBe(31);
  });

  it('buildAllTimeRange starts in 2000 and ends today', () => {
    const r = buildAllTimeRange();
    expect(r.from.getFullYear()).toBe(2000);
    expect(r.to.getDate()).toBe(21);
  });
});

describe('buildRangeForPreset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 21, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('routes each known key to the matching builder', () => {
    expect(buildRangeForPreset('today').from.getDate()).toBe(21);
    expect(buildRangeForPreset('month').from.getDate()).toBe(1);
    expect(buildRangeForPreset('year').from.getMonth()).toBe(0);
    expect(buildRangeForPreset('all').from.getFullYear()).toBe(2000);
  });

  it('falls back to year for unknown / "range" presets', () => {
    const fallback = buildRangeForPreset('range');
    const year = buildYearRange();
    expect(fallback.from.getTime()).toBe(year.from.getTime());
  });
});

describe('preset persistence', () => {
  it('returns "year" when nothing is stored', () => {
    expect(readStoredPreset('user-1')).toBe('year');
  });

  it('round-trips a preset for a specific user', () => {
    savePreset('week', 'user-1');
    expect(readStoredPreset('user-1')).toBe('week');
  });

  it('isolates presets per user id', () => {
    savePreset('week', 'user-1');
    savePreset('today', 'user-2');
    expect(readStoredPreset('user-1')).toBe('week');
    expect(readStoredPreset('user-2')).toBe('today');
  });

  it('rejects unknown stored values and falls back to year', () => {
    localStorage.setItem('expenses-tracker-period-preset:user-1', 'bogus');
    expect(readStoredPreset('user-1')).toBe('year');
  });
});

describe('formatShort / formatRange', () => {
  it('formatShort renders "day month" in the active locale', () => {
    const out = formatShort(new Date(2026, 0, 21));
    expect(out).toMatch(/jan/i);
    expect(out).toContain('21');
  });

  it('formatRange separates from / to with an en-dash', () => {
    const range = {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 0, 31, 23, 59, 59, 999),
    };
    const out = formatRange(range);
    expect(out).toContain(' – ');
    expect(out).toContain('2026');
  });
});
