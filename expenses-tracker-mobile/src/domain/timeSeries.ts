/**
 * Time-series aggregation for the Overview chart — pure logic shared
 * by the React screen and Vitest. Lives under `domain/` (no React
 * imports), mirroring [`categorySummary.ts`](./categorySummary.ts) and
 * the [`exchangeRates.ts`](./exchangeRates.ts) /
 * [`useExchangeRates.ts`](../hooks/useExchangeRates.ts) split.
 *
 * Buckets expenses by a `Granularity` (day / month / year) — `Granularity`
 * is a type alias of the existing `GroupBy` from
 * [`src/utils/dateRange.ts`](../utils/dateRange.ts) so the screen can
 * derive granularity from the active preset via `presetToGroupBy`.
 *
 * The per-bucket aggregator deliberately produces a *dense* points
 * array: empty buckets carry an explicit `0` so the chart's polylines
 * stay continuous and the X axis spacing is uniform — same convention
 * Grafana uses by default ("connect null"). Long-tail categories beyond
 * `topN` are rolled into a synthetic `'__other'` series so legend and
 * line count stay legible on small phones; the cap is exposed as
 * `DEFAULT_TOP_N` so the screen (and a future settings entry) can
 * override it without touching this module.
 *
 * Local-time normalization: all bucket boundaries (midnight, 1st of
 * month, January 1st) use the device's local timezone, matching
 * [`groupExpenses.ts`](../utils/groupExpenses.ts) and the rest of the
 * UI. The UTC-keyed `monthKey()` in `exchangeRates.ts` is unrelated
 * (it pins FX-rate lookups to a stable global month, a different
 * concern).
 */
import type { ExpenseProjection } from './types';
import type { DateRange, GroupBy } from '../utils/dateRange';

/** Re-export the existing grouping type — same vocabulary as the rest of the app. */
export type Granularity = GroupBy;

/**
 * `ExpenseProjection` plus the optional conversion approximation flag.
 * Mirrors the input type used by `computeCategorySummary` so both
 * aggregators accept the output of `useConvertedExpenses` directly.
 */
export type MaybeApprox = ExpenseProjection & { readonly approx?: boolean };

/**
 * Synthetic id used for the long-tail rollup series. Starts with an
 * underscore so it cannot collide with a real category UUID
 * (`VARCHAR(36)` UUIDs never begin with `_`).
 */
export const OTHER_SERIES_ID = '__other';

/**
 * Default cap on named series before the rest are rolled into a
 * synthetic `__other` series. Exported so the Overview screen — and a
 * future user-facing setting — can override it without code changes
 * elsewhere.
 */
export const DEFAULT_TOP_N = 8;

/**
 * Hard safety cap on bucket count. ~11 years of daily data, well past
 * any sensible mobile chart density. Prevents a misconfigured range
 * from allocating millions of empty buckets.
 */
const MAX_BUCKETS = 4096;

export interface ChartSeries {
  /** Category id, or `OTHER_SERIES_ID` for the long-tail rollup. */
  readonly categoryId: string;
  /** Per-bucket amounts in main-currency cents, aligned with `CategorySeries.buckets`. */
  readonly points: ReadonlyArray<number>;
  /** Sum of `points`. Drives legend ordering and Top-N selection. */
  readonly total: number;
  /** True iff any contributing expense was converted with the live fallback rate. */
  readonly approx: boolean;
}

export interface CategorySeries {
  /** Bucket start timestamps (epoch ms), sorted ascending. */
  readonly buckets: ReadonlyArray<number>;
  /** Series sorted by `total` descending; `__other` (when present) is last. */
  readonly series: ReadonlyArray<ChartSeries>;
}

/**
 * Single-series total over the period — basis for the sparkline above
 * the main chart. `approx` is `true` iff any contributing expense fell
 * back to the live FX rate.
 */
export interface TotalSeries {
  readonly buckets: ReadonlyArray<number>;
  readonly points: ReadonlyArray<number>;
  readonly total: number;
  readonly approx: boolean;
}

/**
 * Normalize `date` to the start of its bucket in local time:
 *
 *   - `'day'`   → 00:00 of the same calendar day
 *   - `'month'` → 00:00 of the 1st of that month
 *   - `'year'`  → 00:00 of January 1st of that year
 *
 * Local-time (not UTC) so a midnight-ish expense lands in the bucket
 * the user sees on the device's calendar. JS `Date` handles DST
 * transitions correctly for `new Date(y, m, d)` — the returned instant
 * is always the calendar-day midnight in the device timezone.
 */
export function bucketStart(date: Date, granularity: Granularity): Date {
  switch (granularity) {
    case 'day':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    case 'month':
      return new Date(date.getFullYear(), date.getMonth(), 1);
    case 'year':
      return new Date(date.getFullYear(), 0, 1);
  }
}

/** Returns the start of the *next* bucket after `current`. */
function nextBucketStart(current: Date, granularity: Granularity): Date {
  switch (granularity) {
    case 'day':
      return new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    case 'month':
      return new Date(current.getFullYear(), current.getMonth() + 1, 1);
    case 'year':
      return new Date(current.getFullYear() + 1, 0, 1);
  }
}

/**
 * Enumerate every bucket start (epoch ms) whose start falls within
 * `[bucketStart(range.from), range.to]`. Empty buckets are included so
 * the chart's polylines remain continuous and the X axis is uniformly
 * spaced.
 */
export function enumerateBuckets(
  range: DateRange,
  granularity: Granularity,
): number[] {
  const buckets: number[] = [];
  if (range.to.getTime() < range.from.getTime()) return buckets;
  let cursor = bucketStart(range.from, granularity);
  const stop = range.to.getTime();
  while (cursor.getTime() <= stop && buckets.length < MAX_BUCKETS) {
    buckets.push(cursor.getTime());
    cursor = nextBucketStart(cursor, granularity);
  }
  return buckets;
}

/**
 * Clamp `range.to` to end-of-today — mirrors the convention in
 * `categorySummary.ts` so an end-of-month preset doesn't enumerate
 * empty future buckets when "today" is mid-month.
 */
function clampRangeTo(range: DateRange, now: Date): DateRange {
  const todayEnd = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
    23, 59, 59, 999,
  );
  return { from: range.from, to: range.to > todayEnd ? todayEnd : range.to };
}

/** Build a bucket → index map for O(1) point assignment during aggregation. */
function indexBuckets(buckets: ReadonlyArray<number>): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < buckets.length; i++) {
    map.set(buckets[i]!, i);
  }
  return map;
}

interface MutableSeries {
  readonly categoryId: string;
  readonly points: number[];
  total: number;
  approx: boolean;
}

/**
 * Bucket `expenses` by `(categoryId, bucketStart)` over `range`, group
 * by category, sum cents, keep the top `topN` series by period total,
 * and roll the rest into a synthetic `'__other'` series.
 *
 * Expenses without `date` or `categoryId` are excluded — the Categories
 * tab applies the same convention, and an uncategorised expense has no
 * legend chip to live under anyway.
 *
 * `now` is injectable so tests can pin "now" deterministically;
 * production callers always omit it.
 */
export function computeCategorySeries(
  expenses: ReadonlyArray<MaybeApprox>,
  range: DateRange,
  granularity: Granularity,
  topN: number = DEFAULT_TOP_N,
  now: Date = new Date(),
): CategorySeries {
  const effective = clampRangeTo(range, now);
  const buckets = enumerateBuckets(effective, granularity);
  if (buckets.length === 0) return { buckets, series: [] };

  const indexByBucket = indexBuckets(buckets);
  const acc = new Map<string, MutableSeries>();

  for (const expense of expenses) {
    if (!expense.date || !expense.categoryId) continue;
    const date = new Date(expense.date);
    if (date < effective.from || date > effective.to) continue;
    const idx = indexByBucket.get(bucketStart(date, granularity).getTime());
    if (idx === undefined) continue; // Defensive — should never happen after clamping.

    let series = acc.get(expense.categoryId);
    if (!series) {
      series = {
        categoryId: expense.categoryId,
        points: new Array<number>(buckets.length).fill(0),
        total: 0,
        approx: false,
      };
      acc.set(expense.categoryId, series);
    }
    series.points[idx]! += expense.amount;
    series.total += expense.amount;
    if (expense.approx === true) series.approx = true;
  }

  // Rank by period total desc; keep `topN`, roll the rest into `__other`.
  // Legend order is therefore [named-desc, __other], which also gives a
  // stable stack order in stacked-area mode (largest band at the bottom,
  // long tail at the top).
  const ranked = Array.from(acc.values()).sort((a, b) => b.total - a.total);
  const kept = ranked.slice(0, Math.max(0, topN));
  const overflow = ranked.slice(Math.max(0, topN));

  const series: ChartSeries[] = kept.map((s) => ({
    categoryId: s.categoryId,
    points: s.points,
    total: s.total,
    approx: s.approx,
  }));

  if (overflow.length > 0) {
    const otherPoints = new Array<number>(buckets.length).fill(0);
    let otherTotal = 0;
    let otherApprox = false;
    for (const s of overflow) {
      for (let i = 0; i < buckets.length; i++) {
        otherPoints[i]! += s.points[i]!;
      }
      otherTotal += s.total;
      if (s.approx) otherApprox = true;
    }
    series.push({
      categoryId: OTHER_SERIES_ID,
      points: otherPoints,
      total: otherTotal,
      approx: otherApprox,
    });
  }

  return { buckets, series };
}

/**
 * Single-series grand total over the period — same bucketing as
 * `computeCategorySeries` but ignoring `categoryId`. Used by the
 * Overview screen's top sparkline. Unlike the per-category aggregator,
 * this one includes uncategorised expenses (matches `grandTotal` in
 * `categorySummary.ts`).
 */
export function computeTotalSeries(
  expenses: ReadonlyArray<MaybeApprox>,
  range: DateRange,
  granularity: Granularity,
  now: Date = new Date(),
): TotalSeries {
  const effective = clampRangeTo(range, now);
  const buckets = enumerateBuckets(effective, granularity);
  const points = new Array<number>(buckets.length).fill(0);
  let total = 0;
  let approx = false;

  if (buckets.length === 0) return { buckets, points, total, approx };

  const indexByBucket = indexBuckets(buckets);
  for (const expense of expenses) {
    if (!expense.date) continue;
    const date = new Date(expense.date);
    if (date < effective.from || date > effective.to) continue;
    const idx = indexByBucket.get(bucketStart(date, granularity).getTime());
    if (idx === undefined) continue;
    points[idx]! += expense.amount;
    total += expense.amount;
    if (expense.approx === true) approx = true;
  }

  return { buckets, points, total, approx };
}
