/**
 * Grafana-style time-series chart for the Overview screen.
 *
 * Pure `react-native-svg` — no charting library. Renders either as
 * separate stroked lines per category or as a stacked area, sharing
 * the same axes, gridlines, and scrubber tooltip.
 *
 * Tooltip behaviour: the user drags a finger across the chart to pick
 * a bucket. The tooltip flips horizontally when it would clip the
 * right edge. The PanResponder claims the gesture on touch start, so
 * vertical scrolling of the parent works only when the finger is
 * outside the chart's 240 px slot — acceptable trade-off given how
 * short the Overview screen is.
 *
 * Memoization: path strings and tick positions are derived inside
 * `useMemo` keyed on `(width, buckets, series identities, visible set,
 * mode)`. Tapping legend chips therefore only rebuilds the SVG, never
 * re-renders the parent screen's untouched widgets.
 */
import { memo, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { Surface, Text, useTheme } from 'react-native-paper';

import type { ChartSeries, Granularity } from '../domain/timeSeries';
import { pickTickIndices } from '../utils/chartTicks';
import { formatBucketLabel, formatBucketLabelLong } from '../utils/dateRange';
import { formatCentsShortScale } from '../utils/format';

export interface ExpenseTimeSeriesChartProps {
  /** Bucket boundaries as epoch milliseconds — the domain layer keeps
   *  them as numbers so equality / map-lookups are cheap. */
  readonly buckets: ReadonlyArray<number>;
  /** Series in render order. `__other` should already be appended. */
  readonly series: ReadonlyArray<ChartSeries>;
  /** Currently-visible series ids — series not in this set are skipped.
   *  Pass `undefined` (or omit) to render every series. */
  readonly visibleSeriesIds?: ReadonlySet<string>;
  readonly mode: 'lines' | 'stacked-area';
  readonly granularity: Granularity;
  readonly resolveSeriesName: (id: string) => string;
  readonly resolveSeriesColor: (id: string) => string;
  /** Localized "Total" label for the first row in the scrub tooltip. */
  readonly totalLabel: string;
  /** Localized label for the aggregated overflow row that groups all
   *  categories which don't fit in the popup (capped at chart height). */
  readonly overflowLabel: string;
  readonly language: string;
  /** Label shown when no series are visible / all values are zero. */
  readonly noDataLabel: string;
  /** Total chart height; default 240 leaves room for axes + tooltip. */
  readonly height?: number;
  /** A11y label describing the chart at a glance. */
  readonly accessibilityLabel?: string;
}

// Padding around the plot area. Left is wide to fit ~6-char Y labels.
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;

const STROKE_WIDTH = 2;
const ACTIVE_DOT_RADIUS = 3.5;
// Preferred upper bound on the tooltip width. Kept small so the popup
// always fits in the empty space on *one* side of the cursor line —
// long category names truncate with … inside their row rather than
// pushing the popup wider.
const TOOLTIP_MAX_WIDTH = 200;
// Lower bound — below this the popup becomes hard to read. When the
// available space on both sides is smaller than this (very narrow chart
// + tap near the edge), the popup will fall back to this minimum and
// may briefly clip the line; this is an acceptable edge case.
const TOOLTIP_MIN_WIDTH = 140;
// Gap between the cursor line / chart edge and the tooltip rectangle.
const TOOLTIP_GAP = 8;
// Approximate vertical sizing used to compute how many series rows fit
// inside the popup before overflow. These match the styles applied to
// the corresponding views below (Surface paddingVertical, header
// labelMedium + marginBottom, total row labelSmall + marginVertical).
// Slight underestimates on purpose so we never overflow the chart area.
const TOOLTIP_PADDING_V = 12;
const TOOLTIP_HEADER_H = 22;
const TOOLTIP_TOTAL_ROW_H = 18;
const TOOLTIP_ROW_H = 18;
// Width of the X-axis label slot. Smaller than the default tick spacing
// to leave a 4-8 px gutter between adjacent labels.
const X_LABEL_WIDTH = 64;

/** Round a raw axis maximum up to a "nice" tick value (1/2/5 × 10ⁿ). */
function niceMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(rawMax));
  const norm = rawMax / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Compact Y-axis tick formatter — strips the currency code (already
 * shown in the header + tooltip) and uses a short scale (k / M / B) so
 * even six-figure totals stay within the narrow Y-axis gutter.
 *
 * Examples (locale = en-US):
 *   0           → "0"
 *   95000       → "950"        (950 units)
 *   1234500     → "12.3k"
 *   500000000   → "5M"
 */
export const ExpenseTimeSeriesChart = memo(function ExpenseTimeSeriesChart({
  buckets,
  series,
  visibleSeriesIds,
  mode,
  granularity,
  resolveSeriesName,
  resolveSeriesColor,
  totalLabel,
  overflowLabel,
  language,
  noDataLabel,
  height = 240,
  accessibilityLabel,
}: ExpenseTimeSeriesChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const widthRef = useRef(0);
  const bucketCountRef = useRef(buckets.length);
  bucketCountRef.current = buckets.length;

  const handleLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  // Visible series in the original render order — keeps colour ordering
  // consistent regardless of which chips the user has toggled off.
  // `undefined` from the caller means "show everything".
  const visibleSeries = useMemo(
    () =>
      visibleSeriesIds === undefined
        ? series.slice()
        : series.filter((s) => visibleSeriesIds.has(s.categoryId)),
    [series, visibleSeriesIds],
  );

  // Per-series approx OR-reduced across visible series — used to mark
  // the active tooltip value with the same "~" prefix the rest of the
  // app uses for FX-converted amounts.
  const tooltipAnyApprox = useMemo(
    () => visibleSeries.some((s) => s.approx),
    [visibleSeries],
  );

  // Y-axis scale. Lines mode caps at the highest single-series value;
  // stacked-area mode caps at the highest per-bucket *sum*. Same outer
  // "max across buckets" loop in both cases, only the per-bucket reducer
  // differs.
  const yMax = useMemo(() => {
    if (visibleSeries.length === 0 || buckets.length === 0) return 0;
    const valueAt =
      mode === 'stacked-area'
        ? (i: number) =>
            visibleSeries.reduce((acc, s) => acc + (s.points[i] ?? 0), 0)
        : (i: number) =>
            visibleSeries.reduce((acc, s) => Math.max(acc, s.points[i] ?? 0), 0);
    const rawMax = buckets.reduce((acc, _, i) => Math.max(acc, valueAt(i)), 0);
    return niceMax(rawMax);
  }, [visibleSeries, buckets, mode]);

  const plotWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = Math.max(0, height - PAD_TOP - PAD_BOTTOM);

  // Bucket x positions. Single bucket sits in the centre so a one-day
  // range still shows a visible marker rather than a degenerate line.
  const step = buckets.length > 1 ? plotWidth / (buckets.length - 1) : 0;
  const xAt = (i: number) =>
    buckets.length > 1 ? PAD_LEFT + i * step : PAD_LEFT + plotWidth / 2;
  const yAt = (v: number) =>
    yMax > 0 ? PAD_TOP + plotHeight * (1 - v / yMax) : PAD_TOP + plotHeight;

  // Build SVG path strings. Stacked mode prebuilds prefix-sum arrays so
  // each band's bottom edge is the previous band's top edge.
  const seriesPaths = useMemo(() => {
    if (width <= 0 || buckets.length === 0 || visibleSeries.length === 0) return [];
    if (mode === 'stacked-area') {
      const prefix = new Array<number>(buckets.length).fill(0);
      return visibleSeries.map((s) => {
        const topY: number[] = new Array<number>(buckets.length);
        const bottomY: number[] = new Array<number>(buckets.length);
        for (let i = 0; i < buckets.length; i++) {
          const v = s.points[i] ?? 0;
          bottomY[i] = yAt(prefix[i] ?? 0);
          prefix[i] = (prefix[i] ?? 0) + v;
          topY[i] = yAt(prefix[i] ?? 0);
        }
        // Top edge L→R, then bottom edge R→L, close.
        const topEdge = buckets
          .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${(topY[i] ?? 0).toFixed(2)}`)
          .join(' ');
        const bottomEdge = buckets
          .map(
            (_, idx) => {
              const i = buckets.length - 1 - idx;
              return `L ${xAt(i).toFixed(2)} ${(bottomY[i] ?? 0).toFixed(2)}`;
            },
          )
          .join(' ');
        return { id: s.categoryId, area: `${topEdge} ${bottomEdge} Z`, line: topEdge };
      });
    }
    return visibleSeries.map((s) => {
      const line = buckets
        .map(
          (_, i) =>
            `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(s.points[i] ?? 0).toFixed(2)}`,
        )
        .join(' ');
      return { id: s.categoryId, area: '', line };
    });
    // xAt / yAt close over `step` & `plotHeight`, which are derived from
    // the dependencies already listed — no need to add them explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, buckets, visibleSeries, mode, yMax]);

  const xTickIndices = useMemo(() => {
    // How many labels can physically fit without overlapping. The label
    // for tick `i` is centred at xAt(i); adjacent centres are spaced
    // plotW / (t - 1) apart. For no overlap we need that gap to clear
    // X_LABEL_WIDTH (+ a tiny safety pad), i.e.
    //   t - 1 <= plotW / (X_LABEL_WIDTH + 4)
    // Falls back to 6 before first layout (width === 0).
    const plotW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
    const maxTicks =
      plotW > 0
        ? Math.max(2, Math.floor(plotW / (X_LABEL_WIDTH + 4)) + 1)
        : 6;
    return pickTickIndices(buckets.length, Math.min(maxTicks, 6));
  }, [buckets.length, width]);

  // Y gridline values: 4 lines at 0/25/50/75/100% of yMax.
  const yGridValues = useMemo(() => {
    if (yMax <= 0) return [0];
    return [0, 0.25, 0.5, 0.75, 1].map((p) => p * yMax);
  }, [yMax]);

  // ──────────────────────────────────────────────────────────────
  // Scrub gesture. Map finger X → nearest bucket index. We claim the
  // responder eagerly so a tap (no movement) also triggers the tooltip.
  // The cursor is *transient*: it appears on touch-down, follows the
  // finger across buckets, and disappears on release. This matches
  // the standard mobile chart pattern (Grafana mobile, Apple Health).
  // ──────────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        setActiveIndex(toBucketIndex(event.nativeEvent.locationX));
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        setActiveIndex(toBucketIndex(event.nativeEvent.locationX));
      },
      onPanResponderRelease: () => setActiveIndex(null),
      onPanResponderTerminate: () => setActiveIndex(null),
    }),
  ).current;

  function toBucketIndex(locationX: number): number | null {
    const w = widthRef.current;
    const n = bucketCountRef.current;
    if (w <= 0 || n === 0) return null;
    const innerWidth = Math.max(1, w - PAD_LEFT - PAD_RIGHT);
    if (n === 1) return 0;
    const innerStep = innerWidth / (n - 1);
    const i = Math.round((locationX - PAD_LEFT) / innerStep);
    if (i < 0) return 0;
    if (i > n - 1) return n - 1;
    return i;
  }

  const hasData = visibleSeries.length > 0 && yMax > 0;
  const muted = theme.colors.outlineVariant;
  const axisColor = theme.colors.onSurfaceVariant;

  // ──────────────────────────────────────────────────────────────
  // Tooltip geometry — place the popup on whichever side of the cursor
  // line has more empty space, and size it to fit that side. This
  // guarantees the popup never covers the scrub line (the main visual
  // anchor) and adapts to narrow screens without manual breakpoints.
  // Long category names truncate with … inside their row label.
  // ──────────────────────────────────────────────────────────────
  const tooltip = useMemo(() => {
    if (activeIndex === null || !hasData) return null;
    const anchorX = xAt(activeIndex);
    // Empty space on each side of the line, leaving TOOLTIP_GAP both
    // against the line and against the chart edge.
    const leftSpace = Math.max(0, anchorX - TOOLTIP_GAP * 2);
    const rightSpace = Math.max(0, width - anchorX - TOOLTIP_GAP * 2);
    const useLeftSide = leftSpace >= rightSpace;
    const available = useLeftSide ? leftSpace : rightSpace;
    // Size the popup to the empty space on the chosen side, clamped to
    // [MIN, MAX]. This is what keeps the cursor line visible — width
    // varies with click position, but the popup never grows past the
    // space available on one side.
    const tooltipWidth = Math.max(
      TOOLTIP_MIN_WIDTH,
      Math.min(TOOLTIP_MAX_WIDTH, available),
    );
    const left = useLeftSide
      ? Math.max(TOOLTIP_GAP, anchorX - TOOLTIP_GAP - tooltipWidth)
      : Math.min(
          width - TOOLTIP_GAP - tooltipWidth,
          anchorX + TOOLTIP_GAP,
        );
    const bucket = buckets[activeIndex];
    if (!bucket) return null;
    const sortedRows = visibleSeries
      .map((s) => ({
        id: s.categoryId,
        name: resolveSeriesName(s.categoryId),
        color: resolveSeriesColor(s.categoryId),
        value: s.points[activeIndex] ?? 0,
        approx: s.approx,
      }))
      // Highest value first — easier to read at a glance.
      .sort((a, b) => b.value - a.value);
    // Total reflects the active filter — it's the sum of currently
    // visible series at this bucket, not an unfiltered grand total.
    const total = sortedRows.reduce((acc, r) => acc + r.value, 0);
    // Cap the popup height to the chart's plot area so it never spills
    // over the breakdown list rendered below. Compute how many series
    // rows actually fit in that budget; everything else collapses into
    // a single aggregated "overflow" row appended at the bottom.
    const maxHeight = Math.max(80, height - PAD_TOP - 4);
    const availableForRows =
      maxHeight - TOOLTIP_PADDING_V - TOOLTIP_HEADER_H - TOOLTIP_TOTAL_ROW_H;
    const maxRows = Math.max(1, Math.floor(availableForRows / TOOLTIP_ROW_H));
    let rows = sortedRows;
    if (sortedRows.length > maxRows) {
      // Reserve one slot for the aggregated overflow row.
      const visible = sortedRows.slice(0, maxRows - 1);
      const hidden = sortedRows.slice(maxRows - 1);
      const hiddenSum = hidden.reduce((acc, r) => acc + r.value, 0);
      if (hiddenSum > 0) {
        rows = [
          ...visible,
          {
            id: '__overflow',
            name: overflowLabel,
            color: theme.colors.onSurfaceVariant,
            value: hiddenSum,
            approx: hidden.some((r) => r.approx),
          },
        ];
      } else {
        // All overflow values are zero — show the top `maxRows` rows as-is
        // (no point in collapsing them into a "0" row that adds no info).
        rows = sortedRows.slice(0, maxRows);
      }
    }
    return {
      left,
      width: tooltipWidth,
      maxHeight,
      bucketLabel: formatBucketLabelLong(bucket, granularity, language),
      rows,
      total,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeIndex,
    hasData,
    width,
    height,
    buckets,
    visibleSeries,
    granularity,
    language,
    overflowLabel,
    theme.colors.onSurfaceVariant,
  ]);

  return (
    <View
      style={{ width: '100%', height: height + 4 }}
      onLayout={handleLayout}
      accessible={!!accessibilityLabel}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      {...panResponder.panHandlers}
    >
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {/* Plot background — subtle so the grid still reads. */}
            <Rect
              x={PAD_LEFT}
              y={PAD_TOP}
              width={plotWidth}
              height={plotHeight}
              fill={theme.colors.surface}
            />
            {/* Horizontal gridlines + Y labels. */}
            <G>
              {yGridValues.map((v, i) => {
                const y = yAt(v);
                // Solid line at the baseline (v === 0); dashed elsewhere.
                // `strokeDasharray` must be a real value under
                // `exactOptionalPropertyTypes`, so we conditionally include
                // the prop instead of passing `undefined`.
                return (
                  <Line
                    key={`grid-${i}`}
                    x1={PAD_LEFT}
                    x2={width - PAD_RIGHT}
                    y1={y}
                    y2={y}
                    stroke={muted}
                    strokeWidth={1}
                    {...(v === 0 ? {} : { strokeDasharray: '3,3' })}
                  />
                );
              })}
            </G>
            {/* Series — either stacked areas or stroked lines. */}
            {hasData
              ? seriesPaths.map((p) => {
                  const color = resolveSeriesColor(p.id);
                  if (mode === 'stacked-area') {
                    return (
                      <G key={p.id}>
                        <Path d={p.area} fill={color} fillOpacity={0.55} />
                        <Path d={p.line} stroke={color} strokeWidth={1} fill="none" />
                      </G>
                    );
                  }
                  return (
                    <Path
                      key={p.id}
                      d={p.line}
                      stroke={color}
                      strokeWidth={STROKE_WIDTH}
                      fill="none"
                    />
                  );
                })
              : null}
            {/* Active-bucket scrubber line + per-series dots. */}
            {activeIndex !== null && hasData ? (
              <G>
                <Line
                  x1={xAt(activeIndex)}
                  x2={xAt(activeIndex)}
                  y1={PAD_TOP}
                  y2={PAD_TOP + plotHeight}
                  stroke={theme.colors.onSurface}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  strokeDasharray="4 3"
                />
                {visibleSeries.map((s) => {
                  // Stacked mode: dot sits at the *top* of this series'
                  // band so it visually aligns with the line, not the
                  // baseline. Compute prefix-sum on demand.
                  let valueAtTop: number;
                  if (mode === 'stacked-area') {
                    let sum = 0;
                    for (const v of visibleSeries) {
                      sum += v.points[activeIndex] ?? 0;
                      if (v.categoryId === s.categoryId) break;
                    }
                    valueAtTop = sum;
                  } else {
                    valueAtTop = s.points[activeIndex] ?? 0;
                  }
                  return (
                    <Circle
                      key={`dot-${s.categoryId}`}
                      cx={xAt(activeIndex)}
                      cy={yAt(valueAtTop)}
                      r={ACTIVE_DOT_RADIUS}
                      fill={resolveSeriesColor(s.categoryId)}
                      stroke={theme.colors.surface}
                      strokeWidth={1}
                    />
                  );
                })}
              </G>
            ) : null}
          </Svg>

          {/* Y-axis labels as native Text (crisper than SvgText). The
              currency code is intentionally omitted here — it's already
              shown in the SpendingHeader and tooltip, and dropping it
              keeps long six-figure totals readable in the narrow gutter. */}
          {hasData
            ? yGridValues.map((v, i) => {
                const y = yAt(v);
                return (
                  <Text
                    key={`yl-${i}`}
                    variant="labelSmall"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: y - 8,
                      width: PAD_LEFT - 4,
                      textAlign: 'right',
                      color: axisColor,
                    }}
                    numberOfLines={1}
                  >
                    {formatCentsShortScale(v, language)}
                  </Text>
                );
              })
            : null}

          {/* X-axis labels. Edge ticks are anchored to the plot bounds so
              the first / last labels can't overflow the SVG width — the
              middle ticks stay centred on their bucket as usual. */}
          {hasData
            ? xTickIndices.map((idx) => {
                const bucket = buckets[idx];
                if (bucket === undefined) return null;
                const isFirst = idx === 0;
                const isLast = idx === buckets.length - 1;
                const center = xAt(idx);
                let left: number;
                let textAlign: 'left' | 'center' | 'right';
                if (isFirst) {
                  left = PAD_LEFT;
                  textAlign = 'left';
                } else if (isLast) {
                  left = width - PAD_RIGHT - X_LABEL_WIDTH;
                  textAlign = 'right';
                } else {
                  left = center - X_LABEL_WIDTH / 2;
                  textAlign = 'center';
                }
                return (
                  <Text
                    key={`xl-${idx}`}
                    variant="labelSmall"
                    style={{
                      position: 'absolute',
                      top: PAD_TOP + plotHeight + 4,
                      left,
                      width: X_LABEL_WIDTH,
                      textAlign,
                      color: axisColor,
                    }}
                    numberOfLines={1}
                  >
                    {formatBucketLabel(bucket, granularity, language)}
                  </Text>
                );
              })
            : null}

          {/* Empty state — centered hint inside the plot area. */}
          {!hasData ? (
            <View
              style={{
                position: 'absolute',
                left: PAD_LEFT,
                top: PAD_TOP,
                width: plotWidth,
                height: plotHeight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              pointerEvents="none"
            >
              <Text variant="bodyMedium" style={{ color: axisColor }}>
                {noDataLabel}
              </Text>
            </View>
          ) : null}

          {/* Tooltip card. Positioned absolutely; auto-flips at right edge. */}
          {tooltip ? (
            <Surface
              elevation={2}
              style={{
                position: 'absolute',
                top: PAD_TOP,
                left: tooltip.left,
                width: tooltip.width,
                // Cap the popup height to the plot area so it never spills
                // past the chart bottom. Rows beyond what fits are grouped
                // into an aggregated "overflow" row by the useMemo above.
                maxHeight: tooltip.maxHeight,
                overflow: 'hidden',
                borderRadius: 8,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
              pointerEvents="none"
            >
              <Text variant="labelMedium" style={{ marginBottom: 4 }}>
                {tooltip.bucketLabel}
              </Text>
              {/* Total row — filtered sum across visible series, shown first
                  so the user sees the headline number before the breakdown. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginVertical: 1,
                }}
              >
                {/* Spacer matches the colour swatch width so label columns
                    line up between the total row and series rows below. */}
                <View style={{ width: 8, height: 8 }} />
                <Text
                  variant="labelSmall"
                  style={{
                    flex: 1,
                    color: theme.colors.onSurface,
                    fontWeight: '600',
                  }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {totalLabel}
                </Text>
                <Text
                  variant="labelSmall"
                  style={{
                    color: theme.colors.onSurface,
                    fontWeight: '600',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {(tooltipAnyApprox ? '~' : '') +
                    formatCentsShortScale(tooltip.total, language)}
                </Text>
              </View>
              {tooltip.rows.map((row) => (
                <View
                  key={row.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginVertical: 1,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: row.color,
                    }}
                  />
                  <Text
                    variant="labelSmall"
                    style={{ flex: 1, color: theme.colors.onSurface }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {row.name}
                  </Text>
                  <Text
                    variant="labelSmall"
                    style={{
                      color: theme.colors.onSurface,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {(row.approx || tooltipAnyApprox ? '~' : '') +
                      formatCentsShortScale(row.value, language)}
                  </Text>
                </View>
              ))}
            </Surface>
          ) : null}
        </>
      ) : null}
    </View>
  );
});
