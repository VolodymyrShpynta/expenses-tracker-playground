/**
 * Date-range helpers — port of `expenses-tracker-frontend/src/utils/dateRange.ts`
 * adapted for mobile (no `localStorage`; persistence is handled by the
 * `useDateRange` provider via `AsyncStorage`).
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export type PresetKey = 'all' | 'today' | 'week' | 'month' | 'year';

export const VALID_PRESETS: ReadonlyArray<PresetKey> = [
  'all',
  'today',
  'week',
  'month',
  'year',
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function buildTodayRange(): DateRange {
  const now = new Date();
  return { from: startOfDay(now), to: endOfDay(now) };
}

export function buildWeekRange(): DateRange {
  const now = new Date();
  // Monday-based week (matches default for most locales we ship)
  const day = now.getDay(); // 0=Sun
  const diff = (day + 6) % 7;
  const from = new Date(now);
  from.setDate(now.getDate() - diff);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return { from: startOfDay(from), to: endOfDay(to) };
}

export function buildMonthRange(): DateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

export function buildYearRange(): DateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), 0, 1),
    to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

export function buildAllTimeRange(): DateRange {
  return {
    from: new Date(2000, 0, 1),
    to: endOfDay(new Date()),
  };
}

export function buildRangeForPreset(key: PresetKey): DateRange {
  switch (key) {
    case 'today':
      return buildTodayRange();
    case 'week':
      return buildWeekRange();
    case 'month':
      return buildMonthRange();
    case 'all':
      return buildAllTimeRange();
    case 'year':
      return buildYearRange();
  }
}

export function formatRange(range: DateRange, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const from = range.from.toLocaleDateString(locale, opts).toUpperCase();
  const to = range.to.toLocaleDateString(locale, opts).toUpperCase();
  return `${from} – ${to}`;
}

/**
 * Map the active preset to a sensible grouping granularity for the
 * transactions list:
 *   - 'all'   → year (compact when scrolling decades of data)
 *   - 'year'  → month
 *   - other   → day
 */
export type GroupBy = 'day' | 'month' | 'year';

export function presetToGroupBy(preset: PresetKey): GroupBy {
  switch (preset) {
    case 'year': return 'month';
    case 'all': return 'year';
    default: return 'day';
  }
}

/**
 * Shift a range one period earlier ('prev') or later ('next') based on
 * the active preset. 'all' returns the input unchanged — there is no
 * previous all-time. Returned ranges are normalised with start/end of day.
 */
export function shiftRange(
  range: DateRange,
  preset: PresetKey,
  direction: 'prev' | 'next',
): DateRange {
  if (preset === 'all') return range;
  const sign = direction === 'prev' ? -1 : 1;
  const from = new Date(range.from);
  const to = new Date(range.to);
  switch (preset) {
    case 'today': {
      from.setDate(from.getDate() + sign);
      to.setDate(to.getDate() + sign);
      break;
    }
    case 'week': {
      from.setDate(from.getDate() + sign * 7);
      to.setDate(to.getDate() + sign * 7);
      break;
    }
    case 'month': {
      const newFrom = new Date(from.getFullYear(), from.getMonth() + sign, 1);
      const newTo = new Date(newFrom.getFullYear(), newFrom.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from: newFrom, to: newTo };
    }
    case 'year': {
      const newFrom = new Date(from.getFullYear() + sign, 0, 1);
      const newTo = new Date(newFrom.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { from: newFrom, to: newTo };
    }
  }
  return { from: startOfDay(from), to: endOfDay(to) };
}

export { startOfDay, endOfDay };
