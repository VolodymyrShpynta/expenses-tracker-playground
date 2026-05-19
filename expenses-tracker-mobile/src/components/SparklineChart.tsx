/**
 * Compact total-trend sparkline — pure SVG, framed with a title row
 * (label + running max) and an X-axis tick row, with a scrub gesture
 * that drops a dashed cursor + popup matching the larger
 * `ExpenseTimeSeriesChart` below it.
 *
 * Sits above the main chart to give an at-a-glance sense of the
 * period's shape (matches the Grafana convention of pairing a
 * sparkline with the headline metric). Memoized so unrelated Overview
 * re-renders (mode toggle, legend chip taps) don't rebuild the SVG
 * path strings.
 *
 * X-axis ticks use the same `pickTickIndices` helper as the main
 * chart, so a yearly range shows ~6 evenly-spread month labels rather
 * than only first + last. The scrub tooltip shows the full bucket
 * label + total for the touched bucket — single row, no breakdown.
 *
 * Empty / all-zero input renders a muted placeholder rect — same
 * empty-state convention as `CategoryDonutChart`.
 */
import { memo, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { Surface, Text, useTheme } from 'react-native-paper';

import { pickTickIndices } from '../utils/chartTicks';
import {
  formatBucketLabel,
  formatBucketLabelLong,
  type GroupBy,
} from '../utils/dateRange';
import { formatCentsShortScale } from '../utils/format';

export interface SparklineChartProps {
  /** Per-bucket amounts in cents — the sparkline only cares about shape,
   *  but cents (not units) so the max-value label uses the same
   *  short-scale formatter as the main chart's Y axis. */
  readonly points: ReadonlyArray<number>;
  /** Bucket boundaries as epoch ms — used to label X-axis ticks and
   *  the scrub tooltip header. */
  readonly buckets: ReadonlyArray<number>;
  /** Granularity controls the date format ('day' / 'month' / 'year'). */
  readonly granularity: GroupBy;
  /** Active language code for localised number + date formatting. */
  readonly language: string;
  /** Stroke + (tinted) fill color. Caller decides; usually theme.colors.primary. */
  readonly color: string;
  /** Title shown above the trace (e.g. "Total spending"). */
  readonly title: string;
  /** Localised tooltip row label (e.g. "Total"). */
  readonly totalLabel: string;
  /** Height of the trace area in pixels (excludes title + date rows). */
  readonly traceHeight?: number;
  /** Accessibility label — describes the trend in words (i18n at call site). */
  readonly accessibilityLabel?: string;
}

const PAD = 4;
const HEADER_HEIGHT = 18;
const FOOTER_HEIGHT = 16;
// Tick label slot width and tooltip dimensions mirror the main chart
// (see `ExpenseTimeSeriesChart`) so the two widgets feel like one.
const X_LABEL_WIDTH = 64;
const TOOLTIP_MAX_WIDTH = 200;
const TOOLTIP_MIN_WIDTH = 140;
const TOOLTIP_GAP = 8;
const ACTIVE_DOT_RADIUS = 3.5;

export const SparklineChart = memo(function SparklineChart({
  points,
  buckets,
  granularity,
  language,
  color,
  title,
  totalLabel,
  traceHeight = 48,
  accessibilityLabel,
}: SparklineChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const widthRef = useRef(0);
  const bucketCountRef = useRef(points.length);
  bucketCountRef.current = points.length;

  const handleLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  // The running max — surfaced in the title row so the user sees the
  // peak of the trend without scrubbing. `0` falls back to a dash so
  // an empty range doesn't show a meaningless "0".
  const maxValue = useMemo(
    () => points.reduce((m, p) => (p > m ? p : m), 0),
    [points],
  );

  // Bucket geometry shared by path generation, scrub dot, and X ticks.
  // With a single bucket, place the dot in the middle so the area
  // still renders as a small lobe rather than a zero-width sliver.
  const plotWidth = Math.max(0, width - PAD * 2);
  const plotHeight = Math.max(0, traceHeight - PAD * 2);
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xAt = (i: number) =>
    points.length > 1 ? PAD + i * step : PAD + plotWidth / 2;
  const yAt = (v: number) =>
    maxValue > 0 ? PAD + plotHeight * (1 - v / maxValue) : PAD + plotHeight;

  // Derive both path strings together so they share the same scale and
  // skip recomputation when only `color` or `accessibilityLabel` change.
  const paths = useMemo(() => {
    if (
      width <= 0 ||
      points.length === 0 ||
      maxValue <= 0 ||
      plotWidth === 0 ||
      plotHeight === 0
    ) {
      return null;
    }
    const stroke = points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`)
      .join(' ');
    // Close the area path along the baseline so it fills under the stroke.
    const baselineRight = xAt(points.length - 1).toFixed(2);
    const baselineLeft = xAt(0).toFixed(2);
    const baselineY = (PAD + plotHeight).toFixed(2);
    const area = `${stroke} L ${baselineRight} ${baselineY} L ${baselineLeft} ${baselineY} Z`;
    return { stroke, area };
    // xAt / yAt close over `step` & `plotHeight`, derived from the deps
    // already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, traceHeight, maxValue]);

  const xTickIndices = useMemo(() => {
    // Same width-aware label cap as the main chart. Falls back to 6
    // before first layout (width === 0).
    const plotW = Math.max(0, width - PAD * 2);
    const maxTicks =
      plotW > 0 ? Math.max(2, Math.floor(plotW / (X_LABEL_WIDTH + 4)) + 1) : 6;
    return pickTickIndices(buckets.length, Math.min(maxTicks, 6));
  }, [buckets.length, width]);

  // ──────────────────────────────────────────────────────────────
  // Scrub gesture — claim the responder eagerly so a tap (no
  // movement) also triggers the tooltip. Transient cursor: appears on
  // touch-down, disappears on release. Matches `ExpenseTimeSeriesChart`.
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
    if (n === 1) return 0;
    const innerWidth = Math.max(1, w - PAD * 2);
    const innerStep = innerWidth / (n - 1);
    const i = Math.round((locationX - PAD) / innerStep);
    if (i < 0) return 0;
    if (i > n - 1) return n - 1;
    return i;
  }

  const muted = theme.colors.surfaceVariant;
  const onSurface = theme.colors.onSurface;
  const onSurfaceVariant = theme.colors.onSurfaceVariant;
  const hasData = maxValue > 0 && points.length > 0;

  // Side-aware tooltip placement: pick whichever side of the cursor
  // line has more empty space and size the popup to fit it, clamped
  // to [MIN, MAX]. Single row (bucket label + total) — no per-series
  // breakdown to worry about here.
  const tooltip = useMemo(() => {
    if (activeIndex === null || !hasData) return null;
    const bucket = buckets[activeIndex];
    if (bucket === undefined) return null;
    const anchorX = xAt(activeIndex);
    const leftSpace = Math.max(0, anchorX - TOOLTIP_GAP * 2);
    const rightSpace = Math.max(0, width - anchorX - TOOLTIP_GAP * 2);
    const useLeftSide = leftSpace >= rightSpace;
    const available = useLeftSide ? leftSpace : rightSpace;
    const tooltipWidth = Math.max(
      TOOLTIP_MIN_WIDTH,
      Math.min(TOOLTIP_MAX_WIDTH, available),
    );
    const left = useLeftSide
      ? Math.max(TOOLTIP_GAP, anchorX - TOOLTIP_GAP - tooltipWidth)
      : Math.min(width - TOOLTIP_GAP - tooltipWidth, anchorX + TOOLTIP_GAP);
    return {
      left,
      width: tooltipWidth,
      bucketLabel: formatBucketLabelLong(bucket, granularity, language),
      value: points[activeIndex] ?? 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, hasData, width, buckets, points, granularity, language]);

  const maxLabel = maxValue > 0 ? formatCentsShortScale(maxValue, language) : '—';

  return (
    <View
      style={{ width: '100%' }}
      accessible={!!accessibilityLabel}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {/* Title row — label left, peak value right. Same row + variants
          used in `SpendingHeader` so the typography lines up visually. */}
      <View
        style={{
          height: HEADER_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="labelMedium" style={{ color: onSurface }} numberOfLines={1}>
          {title}
        </Text>
        <Text
          variant="labelSmall"
          style={{ color: onSurfaceVariant, fontVariant: ['tabular-nums'] }}
          numberOfLines={1}
        >
          {maxLabel}
        </Text>
      </View>

      <View
        style={{ width: '100%', height: traceHeight }}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {width > 0 ? (
          <Svg width={width} height={traceHeight}>
            {paths ? (
              <>
                <Path d={paths.area} fill={color} fillOpacity={0.18} />
                <Path d={paths.stroke} stroke={color} strokeWidth={1.5} fill="none" />
              </>
            ) : (
              // Empty / all-zero fallback — a muted bar so the slot keeps
              // its height and doesn't visually collapse.
              <Rect
                x={PAD}
                y={traceHeight / 2 - 1}
                width={width - PAD * 2}
                height={2}
                fill={muted}
              />
            )}
            {activeIndex !== null && hasData ? (
              <G>
                <Line
                  x1={xAt(activeIndex)}
                  x2={xAt(activeIndex)}
                  y1={PAD}
                  y2={PAD + plotHeight}
                  stroke={onSurface}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  strokeDasharray="4 3"
                />
                <Circle
                  cx={xAt(activeIndex)}
                  cy={yAt(points[activeIndex] ?? 0)}
                  r={ACTIVE_DOT_RADIUS}
                  fill={color}
                  stroke={theme.colors.surface}
                  strokeWidth={1}
                />
              </G>
            ) : null}
          </Svg>
        ) : null}
      </View>

      {/* X-axis tick labels — evenly distributed via `pickTickIndices`.
          First / last labels are anchored to the chart bounds so they
          can't overflow the container width; middle ticks stay centred
          on their bucket. Same logic as `ExpenseTimeSeriesChart`. */}
      {width > 0 && xTickIndices.length > 0 ? (
        <View style={{ height: FOOTER_HEIGHT }}>
          {xTickIndices.map((idx) => {
            const bucket = buckets[idx];
            if (bucket === undefined) return null;
            const isFirst = idx === 0;
            const isLast = idx === buckets.length - 1;
            const center = xAt(idx);
            let left: number;
            let textAlign: 'left' | 'center' | 'right';
            if (isFirst) {
              left = 0;
              textAlign = 'left';
            } else if (isLast) {
              left = width - X_LABEL_WIDTH;
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
                  top: 0,
                  left,
                  width: X_LABEL_WIDTH,
                  textAlign,
                  color: onSurfaceVariant,
                }}
                numberOfLines={1}
              >
                {formatBucketLabel(bucket, granularity, language)}
              </Text>
            );
          })}
        </View>
      ) : null}

      {/* Tooltip card. Positioned absolutely over the trace area;
          auto-flips horizontally near the right edge. */}
      {tooltip ? (
        <Surface
          elevation={2}
          style={{
            position: 'absolute',
            top: HEADER_HEIGHT,
            left: tooltip.left,
            width: tooltip.width,
            borderRadius: 8,
            paddingVertical: 6,
            paddingHorizontal: 10,
          }}
          pointerEvents="none"
        >
          <Text variant="labelMedium" style={{ marginBottom: 4 }}>
            {tooltip.bucketLabel}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginVertical: 1,
            }}
          >
            <Text
              variant="labelSmall"
              style={{ flex: 1, color: onSurface, fontWeight: '600' }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {totalLabel}
            </Text>
            <Text
              variant="labelSmall"
              style={{
                color: onSurface,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatCentsShortScale(tooltip.value, language)}
            </Text>
          </View>
        </Surface>
      ) : null}
    </View>
  );
});
