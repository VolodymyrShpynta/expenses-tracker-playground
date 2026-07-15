/**
 * Date-range helpers — port of `expenses-tracker-frontend/src/utils/dateRange.ts`
 * adapted for mobile (no `localStorage`; persistence is handled by the
 * `useDateRange` provider via `AsyncStorage`).
 */

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Period presets exposed by the date-range selector.
 *
 *   - `range` / `day` are picker-driven: the user picks the dates via a
 *     calendar modal, so they have no implicit "current" range. We use
 *     month/today as the hydration fallback when only the key is
 *     persisted (matches the web frontend behaviour).
 *   - The rest snap to a window relative to *now*.
 */
export type PresetKey =
  | 'range'
  | 'all'
  | 'day'
  | 'week'
  | 'today'
  | 'year'
  | 'month';

export const VALID_PRESETS: ReadonlyArray<PresetKey> = [
  'range',
  'all',
  'day',
  'week',
  'today',
  'year',
  'month',
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
    // Picker-driven presets have no implicit window — fall back to a
    // sensible default for hydration, the picker will overwrite it once
    // the user confirms.
    case 'day':
      return buildTodayRange();
    case 'range':
      return buildMonthRange();
  }
}

// Calendar-field significance for range elision — smaller = more
// significant. A range shares (and shows once) every field strictly more
// significant than the most-significant field where its two endpoints
// differ.
const FIELD_RANK = { year: 0, month: 1, day: 2 } as const;

/**
 * Format a date range as a single compact, locale-aware header label.
 *
 * Fields shared by both endpoints are elided the way
 * `Intl.DateTimeFormat`'s `formatRange` would, so the label fits on
 * narrow phones instead of being truncated with an ellipsis:
 *
 *   - same day      → `1 ЛИП. 2026 Р.`              (one date, no range)
 *   - same month    → `1 – 31 ЛИП. 2026 Р.`         (month + year once)
 *   - same year     → `1 СІЧ. – 31 ГРУД. 2026 Р.`   (year once)
 *   - cross year     → `1 СІЧ. 2000 Р. – 15 ЛИП. 2026 Р.`  (full both sides)
 *
 * We deliberately do NOT call the native `Intl.DateTimeFormat.formatRange`:
 * Hermes doesn't ship it on every React Native platform (it was pulled
 * from iOS around RN 0.76), so relying on it would silently fall back to
 * the long form on device while passing in Node tests. Instead we elide
 * manually from `formatToParts`, which keeps the day/month/year *ordering*
 * correct for every locale (DMY / MDY / YMD) and stays unit-testable on
 * Node. If `formatToParts` is unavailable we fall back to the plain
 * two-sided format.
 */
/**
 * Central date formatter — a thin wrapper over `Intl.toLocaleDateString` so
 * the app formats dates in one place (easy to tweak later). Uses the
 * platform's standard localized format as-is; no custom post-processing.
 */
export function formatDate(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleDateString(locale, options);
}

export function formatRange(range: DateRange, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const { from, to } = range;

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  const sameDay = sameMonth && from.getDate() === to.getDate();

  // A single-day window (today / picked day) reads as one date, not a range.
  if (sameDay) return formatDate(from, locale, opts).toUpperCase();

  // Elision only makes sense within a year — cross-year ranges share no
  // outer field, so they keep the full form on both sides.
  if (sameYear) {
    const elided = elideSameYearRange(from, to, sameMonth, locale, opts);
    if (elided) return elided.toUpperCase();
  }

  const fromLabel = formatDate(from, locale, opts);
  const toLabel = formatDate(to, locale, opts);
  return `${fromLabel} – ${toLabel}`.toUpperCase();
}

/**
 * Build the elided label for a range whose endpoints fall in the same
 * calendar year. Shared, more-significant fields (year — plus month when
 * both endpoints share it) are rendered once; the differing span is
 * rendered for both endpoints. Returns `null` when the platform's `Intl`
 * can't produce parts so the caller falls back to the plain format.
 */
function elideSameYearRange(
  from: Date,
  to: Date,
  sameMonth: boolean,
  locale: string,
  opts: Intl.DateTimeFormatOptions,
): string | null {
  try {
    const formatter = new Intl.DateTimeFormat(locale, opts);
    const fromParts = formatter.formatToParts(from);
    const toParts = formatter.formatToParts(to);

    // Most-significant field that differs. Years are equal here, so it's
    // the month when the months differ, otherwise the day. Everything
    // strictly more significant is shared and shown once.
    const diffRank = sameMonth ? FIELD_RANK.day : FIELD_RANK.month;
    const rankOf = (type: Intl.DateTimeFormatPartTypes): number =>
      type === 'year'
        ? FIELD_RANK.year
        : type === 'month'
          ? FIELD_RANK.month
          : type === 'day'
            ? FIELD_RANK.day
            : -1;

    // Bound the differing span by the first/last significant part at or
    // below the differing field. Literals inside the span travel with
    // their side; literals outside it are shared.
    let firstDiff = -1;
    let lastDiff = -1;
    fromParts.forEach((part, index) => {
      if (rankOf(part.type) >= diffRank) {
        if (firstDiff === -1) firstDiff = index;
        lastDiff = index;
      }
    });
    if (firstDiff === -1) return null;

    const join = (parts: Intl.DateTimeFormatPart[], start: number, end: number): string =>
      parts
        .slice(start, end)
        .map((part) => part.value)
        .join('');

    const prefix = join(fromParts, 0, firstDiff);
    const suffix = join(fromParts, lastDiff + 1, fromParts.length);
    const fromSpan = join(fromParts, firstDiff, lastDiff + 1);
    const toSpan = join(toParts, firstDiff, lastDiff + 1);
    return `${prefix}${fromSpan} – ${toSpan}${suffix}`;
  } catch {
    return null;
  }
}

/** Short "day month" label (e.g. "May 1") for preset subtitles. */
export function formatShort(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * Render a bucket boundary (epoch ms) as a compact chart-axis label
 * tailored to the granularity:
 *   - 'day'   → `'May 5'`
 *   - 'month' → `'May 26'`   (short month + 2-digit year, matches the
 *                              format used by `SpendingHeader`)
 *   - 'year'  → `'2026'`
 *
 * Falls back to an ISO date prefix if the locale string is malformed
 * (e.g. an empty `i18n.language` during early hydration) so the chart
 * never throws during render.
 */
export function formatBucketLabel(
  epochMs: number,
  granularity: GroupBy,
  locale: string,
): string {
  const date = new Date(epochMs);
  try {
    if (granularity === 'year') return String(date.getFullYear());
    if (granularity === 'month') {
      return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Render a bucket boundary as a long-form label suitable for chart
 * tooltips. Longer than `formatBucketLabel` so the user sees the full
 * month name + 4-digit year, but still localised through `Intl`.
 */
export function formatBucketLabelLong(
  epochMs: number,
  granularity: GroupBy,
  locale: string,
): string {
  const date = new Date(epochMs);
  try {
    if (granularity === 'year') return String(date.getFullYear());
    if (granularity === 'month') {
      return formatDate(date, locale, { month: 'long', year: 'numeric' });
    }
    return formatDate(date, locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Map the active preset to a sensible grouping granularity for the
 * transactions list:
 *   - 'all'   → year (compact when scrolling decades of data)
 *   - 'year'  → month
 *   - 'range' → duration-based: ≤ ~1 month → day, ≤ ~1 year → month,
 *               otherwise → year (so a custom range stays readable
 *               regardless of how wide the user picked it)
 *   - other   → day
 */
export type GroupBy = 'day' | 'month' | 'year';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function presetToGroupBy(preset: PresetKey, range?: DateRange): GroupBy {
  switch (preset) {
    case 'year':
      return 'month';
    case 'all':
      return 'year';
    case 'range': {
      if (!range) return 'day';
      const days = (range.to.getTime() - range.from.getTime()) / MS_PER_DAY;
      if (days <= 31) return 'day';
      if (days <= 366) return 'month';
      return 'year';
    }
    default:
      return 'day';
  }
}

/**
 * Shift a range one period earlier ('prev') or later ('next') based on
 * the active preset. Presets without a natural period (`all`, `range`,
 * `day`) return the input unchanged — the header hides the chevrons in
 * those cases. Returned ranges are normalised with start/end of day.
 */
export function shiftRange(
  range: DateRange,
  preset: PresetKey,
  direction: 'prev' | 'next',
): DateRange {
  if (preset === 'all' || preset === 'range' || preset === 'day') return range;
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
