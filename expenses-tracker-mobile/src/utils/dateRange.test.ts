/**
 * Tests for `dateRange.ts` — period builders, preset → grouping mapping,
 * and the prev/next range shifter.
 *
 * The helpers all read `new Date()` internally for "now"; we pin the
 * system time to a deterministic local-time anchor with `vi.useFakeTimers`
 * so the assertions don't depend on the host clock. The anchor is
 * **Wednesday, 15 May 2024 at 12:00 local** — picked specifically so:
 *   - `buildWeekRange()`'s Monday-first math has a non-Monday weekday to
 *     project from,
 *   - `buildMonthRange()` doesn't accidentally pass at month boundaries,
 *   - using local noon means timezone offsets on the test host can't
 *     push the anchor into a different calendar day.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAllTimeRange,
  buildMonthRange,
  buildRangeForPreset,
  buildTodayRange,
  buildWeekRange,
  buildYearRange,
  endOfDay,
  formatDate,
  formatRange,
  presetToGroupBy,
  shiftRange,
  startOfDay,
  VALID_PRESETS,
} from './dateRange';
import type { DateRange } from './dateRange';

const ANCHOR = new Date(2024, 4, 15, 12, 0, 0); // Wed 15 May 2024 12:00 local

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(ANCHOR);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startOfDay / endOfDay', () => {
  it('should normalise to local 00:00:00.000 and 23:59:59.999 respectively', () => {
    // Given: an arbitrary time on a known day
    const d = new Date(2024, 4, 15, 14, 30, 45, 123);

    // When
    const s = startOfDay(d);
    const e = endOfDay(d);

    // Then
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
    expect(e.getSeconds()).toBe(59);
    expect(e.getMilliseconds()).toBe(999);
  });
});

describe('buildTodayRange', () => {
  it('should span [start of today, end of today]', () => {
    // When
    const r = buildTodayRange();

    // Then
    expect(r.from).toEqual(new Date(2024, 4, 15, 0, 0, 0, 0));
    expect(r.to).toEqual(new Date(2024, 4, 15, 23, 59, 59, 999));
  });
});

describe('buildWeekRange', () => {
  it('should span Monday → Sunday for a midweek anchor (Wed 15 May 2024)', () => {
    // When
    const r = buildWeekRange();

    // Then: Monday is the 13th, Sunday is the 19th
    expect(r.from).toEqual(new Date(2024, 4, 13, 0, 0, 0, 0));
    expect(r.to).toEqual(new Date(2024, 4, 19, 23, 59, 59, 999));
  });

  it('should handle a Sunday anchor by snapping back to the previous Monday', () => {
    // Given: Sunday 19 May 2024 at noon
    vi.setSystemTime(new Date(2024, 4, 19, 12, 0, 0));

    // When
    const r = buildWeekRange();

    // Then: same Mon→Sun span (13th–19th)
    expect(r.from).toEqual(new Date(2024, 4, 13, 0, 0, 0, 0));
    expect(r.to).toEqual(new Date(2024, 4, 19, 23, 59, 59, 999));
  });

  it('should handle a Monday anchor by keeping the same day as `from`', () => {
    // Given: Monday 13 May 2024
    vi.setSystemTime(new Date(2024, 4, 13, 12, 0, 0));

    // When
    const r = buildWeekRange();

    // Then
    expect(r.from).toEqual(new Date(2024, 4, 13, 0, 0, 0, 0));
    expect(r.to).toEqual(new Date(2024, 4, 19, 23, 59, 59, 999));
  });
});

describe('buildMonthRange', () => {
  it('should span the first → last day of the current month', () => {
    // When
    const r = buildMonthRange();

    // Then: May has 31 days
    expect(r.from).toEqual(new Date(2024, 4, 1, 0, 0, 0, 0));
    expect(r.to).toEqual(new Date(2024, 4, 31, 23, 59, 59, 999));
  });

  it('should pick the correct number of days in February of a leap year', () => {
    // Given: 1 Feb 2024 (leap year)
    vi.setSystemTime(new Date(2024, 1, 1, 12, 0, 0));

    // When
    const r = buildMonthRange();

    // Then: 29 days
    expect(r.to.getDate()).toBe(29);
  });
});

describe('buildYearRange', () => {
  it('should span Jan 1 → Dec 31 of the current year', () => {
    // When
    const r = buildYearRange();

    // Then
    expect(r.from).toEqual(new Date(2024, 0, 1, 0, 0, 0, 0));
    expect(r.to).toEqual(new Date(2024, 11, 31, 23, 59, 59, 999));
  });
});

describe('buildAllTimeRange', () => {
  it('should start at 2000-01-01 and end at end-of-today', () => {
    // When
    const r = buildAllTimeRange();

    // Then
    expect(r.from).toEqual(new Date(2000, 0, 1));
    expect(r.to).toEqual(new Date(2024, 4, 15, 23, 59, 59, 999));
  });
});

describe('buildRangeForPreset', () => {
  it('should map each named preset to the corresponding builder', () => {
    expect(buildRangeForPreset('today')).toEqual(buildTodayRange());
    expect(buildRangeForPreset('week')).toEqual(buildWeekRange());
    expect(buildRangeForPreset('month')).toEqual(buildMonthRange());
    expect(buildRangeForPreset('year')).toEqual(buildYearRange());
    expect(buildRangeForPreset('all')).toEqual(buildAllTimeRange());
  });

  it('should fall back to today for the picker-driven `day` preset', () => {
    // When/Then: until the picker writes a real range, day == today
    expect(buildRangeForPreset('day')).toEqual(buildTodayRange());
  });

  it('should fall back to the current month for the picker-driven `range` preset', () => {
    // When/Then
    expect(buildRangeForPreset('range')).toEqual(buildMonthRange());
  });

  it('should cover every key in VALID_PRESETS (no missing switch arm)', () => {
    // Given: the official list of presets
    // When: building a range for each
    // Then: every call returns a `DateRange` (no `undefined` slipping out)
    for (const key of VALID_PRESETS) {
      const r = buildRangeForPreset(key);
      expect(r.from).toBeInstanceOf(Date);
      expect(r.to).toBeInstanceOf(Date);
      expect(r.to.getTime()).toBeGreaterThanOrEqual(r.from.getTime());
    }
  });
});

describe('presetToGroupBy', () => {
  it('should map fixed-window presets to fixed grouping granularities', () => {
    expect(presetToGroupBy('today')).toBe('day');
    expect(presetToGroupBy('week')).toBe('day');
    expect(presetToGroupBy('month')).toBe('day');
    expect(presetToGroupBy('year')).toBe('month');
    expect(presetToGroupBy('all')).toBe('year');
    expect(presetToGroupBy('day')).toBe('day');
  });

  it('should fall back to `day` for the `range` preset when no range is provided', () => {
    expect(presetToGroupBy('range')).toBe('day');
  });

  describe('range — duration-based bucketing', () => {
    function rangeOfDays(days: number): DateRange {
      const from = new Date(2024, 0, 1);
      const to = new Date(from);
      to.setDate(from.getDate() + days);
      return { from, to };
    }

    it('should pick `day` for a custom range ≤ 31 days', () => {
      expect(presetToGroupBy('range', rangeOfDays(7))).toBe('day');
      expect(presetToGroupBy('range', rangeOfDays(31))).toBe('day');
    });

    it('should pick `month` for a custom range > 31 days and ≤ 366 days', () => {
      expect(presetToGroupBy('range', rangeOfDays(60))).toBe('month');
      expect(presetToGroupBy('range', rangeOfDays(366))).toBe('month');
    });

    it('should pick `year` for a custom range > 366 days', () => {
      expect(presetToGroupBy('range', rangeOfDays(367))).toBe('year');
      expect(presetToGroupBy('range', rangeOfDays(365 * 3))).toBe('year');
    });
  });
});

describe('shiftRange', () => {
  function todayRange(): DateRange {
    return buildTodayRange();
  }

  it('should return the input unchanged for presets without a natural period', () => {
    // Given: an arbitrary range
    const r = todayRange();

    // When/Then: 'all', 'range', and 'day' are no-ops
    expect(shiftRange(r, 'all', 'prev')).toBe(r);
    expect(shiftRange(r, 'range', 'next')).toBe(r);
    expect(shiftRange(r, 'day', 'prev')).toBe(r);
  });

  it('should shift `today` by one day in each direction', () => {
    // Given
    const r = todayRange();

    // When
    const prev = shiftRange(r, 'today', 'prev');
    const next = shiftRange(r, 'today', 'next');

    // Then
    expect(prev.from).toEqual(new Date(2024, 4, 14, 0, 0, 0, 0));
    expect(prev.to).toEqual(new Date(2024, 4, 14, 23, 59, 59, 999));
    expect(next.from).toEqual(new Date(2024, 4, 16, 0, 0, 0, 0));
    expect(next.to).toEqual(new Date(2024, 4, 16, 23, 59, 59, 999));
  });

  it('should shift `week` by 7 days in each direction', () => {
    // Given: current week (Mon 13 → Sun 19)
    const r = buildWeekRange();

    // When
    const prev = shiftRange(r, 'week', 'prev');
    const next = shiftRange(r, 'week', 'next');

    // Then
    expect(prev.from).toEqual(new Date(2024, 4, 6, 0, 0, 0, 0));
    expect(prev.to).toEqual(new Date(2024, 4, 12, 23, 59, 59, 999));
    expect(next.from).toEqual(new Date(2024, 4, 20, 0, 0, 0, 0));
    expect(next.to).toEqual(new Date(2024, 4, 26, 23, 59, 59, 999));
  });

  it('should snap to the natural month bounds when shifting `month`', () => {
    // Given: May 2024
    const r = buildMonthRange();

    // When
    const prev = shiftRange(r, 'month', 'prev');
    const next = shiftRange(r, 'month', 'next');

    // Then: April (30 days) and June (30 days)
    expect(prev.from).toEqual(new Date(2024, 3, 1));
    expect(prev.to).toEqual(new Date(2024, 3, 30, 23, 59, 59, 999));
    expect(next.from).toEqual(new Date(2024, 5, 1));
    expect(next.to).toEqual(new Date(2024, 5, 30, 23, 59, 59, 999));
  });

  it('should snap to the natural year bounds when shifting `year`', () => {
    // Given: 2024
    const r = buildYearRange();

    // When
    const prev = shiftRange(r, 'year', 'prev');
    const next = shiftRange(r, 'year', 'next');

    // Then
    expect(prev.from).toEqual(new Date(2023, 0, 1));
    expect(prev.to).toEqual(new Date(2023, 11, 31, 23, 59, 59, 999));
    expect(next.from).toEqual(new Date(2025, 0, 1));
    expect(next.to).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
  });
});

describe('formatRange', () => {
  // Count non-overlapping occurrences of `needle` in `haystack`.
  function occurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  it('should collapse a single-day range to one date (no range dash)', () => {
    // Given: today's window (start → end of the same day)
    const range: DateRange = {
      from: new Date(2026, 6, 15, 0, 0, 0, 0),
      to: new Date(2026, 6, 15, 23, 59, 59, 999),
    };

    // When
    const label = formatRange(range, 'en-US');

    // Then: exactly the single date, uppercased, with no range separator
    expect(label).toBe('JUL 15, 2026');
    expect(label).not.toContain('–');
  });

  it('should show the month and year once for a same-month range (en-US)', () => {
    // Given: the whole of July 2026
    const range: DateRange = {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 6, 31),
    };

    // When
    const label = formatRange(range, 'en-US');

    // Then: "JUL 1 – 31, 2026" — month + year elided to a single side
    expect(label).toBe('JUL 1 – 31, 2026');
  });

  it('should keep the locale field order when eliding (uk = day month year)', () => {
    // Given: the whole of July 2026
    const range: DateRange = {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 6, 31),
    };

    // When
    const label = formatRange(range, 'uk');

    // Then: both day numbers survive, the month appears once, and the
    // trailing year is shared (a single range dash).
    const month = new Date(2026, 6, 1).toLocaleDateString('uk', { month: 'short' }).toUpperCase();
    expect(label).toContain('1');
    expect(label).toContain('31');
    expect(occurrences(label, '–')).toBe(1);
    expect(occurrences(label, month.replace(/\.$/, ''))).toBe(1);
  });

  it('should show the year once for a same-year, cross-month range (en-US)', () => {
    // Given: the whole of 2026
    const range: DateRange = {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 11, 31),
    };

    // When
    const label = formatRange(range, 'en-US');

    // Then: both months shown, year elided to a single side
    expect(label).toBe('JAN 1 – DEC 31, 2026');
  });

  it('should keep the full form on both sides for a cross-year range', () => {
    // Given: an all-time-ish span across different years
    const range: DateRange = {
      from: new Date(2000, 0, 1),
      to: new Date(2026, 6, 15),
    };

    // When
    const label = formatRange(range, 'en-US');

    // Then: no elision — each endpoint carries its own year
    expect(label).toBe('JAN 1, 2000 – JUL 15, 2026');
  });
});

describe('formatDate', () => {
  it('formats via the standard locale format (no custom trimming)', () => {
    expect(
      formatDate(new Date(2026, 6, 15), 'en-US', { month: 'long', year: 'numeric' }),
    ).toBe('July 2026');
  });

  it("keeps the locale's own year decoration (e.g. uk \"р.\")", () => {
    // We deliberately no longer strip the year suffix — the standard
    // localized string is used as-is.
    const out = formatDate(new Date(2026, 6, 15), 'uk', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(out).toContain('2026');
    expect(out).toContain('р.');
  });
});
