/**
 * Category donut chart — pure SVG, no external charting library.
 *
 * Slices are contiguous annular sectors: neighbours meet edge to edge, so the
 * ring reads as one whole that has been divided, which is the thing the chart
 * is for. Each slice is painted with its own two-stop gradient (its colour,
 * lightened at the head) so the ring has the same depth as the gradients
 * elsewhere in the app.
 *
 * The centre stays empty on purpose. The ring's job is proportion; the period
 * total is already the hero above it and the leading category is already the
 * first row of the list below, so anything written there permanently is a
 * third printing of something on the same screen. Detail is on demand
 * instead: tapping a slice lifts it and pins a callout with that category's
 * name, amount and share. Tapping it again — or the callout — puts it away.
 *
 * Motion is a fade-scale-unwind on the container — a plain view transform,
 * so it can't interact with SVG rendering. Empty input renders the muted
 * track ring on its own.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text, useTheme } from 'react-native-paper';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppColors } from '../theme/appColors';
import { motionDuration, motionEasing, useMotionEnabled } from '../theme/motion';
import { lighten } from '../utils/colorContrast';
import { formatTotalCompactWithCurrency } from '../utils/format';

export interface DonutSlice {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly color: string;
  /** Set when the converted total fell back to the live FX rate. */
  readonly approx?: boolean;
}

export interface CategoryDonutChartProps {
  readonly slices: ReadonlyArray<DonutSlice>;
  readonly currency: string;
  readonly language: string;
  readonly size?: number;
  readonly thickness?: number;
}

const TAU = Math.PI * 2;
/** Slices run clockwise from 12 o'clock, not from SVG's 3 o'clock. */
const START_ANGLE = -Math.PI / 2;
/** How far the selected slice grows out of the ring. */
const POP = 4;
/** Half-width of the callout's pointer, which is a square turned 45°. */
const ARROW = 7;
/** Kept between the callout and the slice it points at. */
const TIP_GAP = 6;

export function CategoryDonutChart({
  slices,
  currency,
  language,
  size = 220,
  thickness = Math.round(size * 0.26),
}: CategoryDonutChartProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tipSize, setTipSize] = useState<{ width: number; height: number } | null>(null);

  const center = size / 2;
  // The selected slice grows outward, so the ring gives up `POP` to keep it
  // inside the box.
  const outerRadius = center - POP;
  const innerRadius = outerRadius - thickness;
  const midRadius = (outerRadius + innerRadius) / 2;

  const total = useMemo(
    () => slices.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0),
    [slices],
  );

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let angle = START_ANGLE;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * TAU;
        const segment = {
          ...s,
          start: angle,
          end: angle + sweep,
          mid: angle + sweep / 2,
          share: s.value / total,
        };
        angle += sweep;
        return segment;
      });
  }, [slices, total]);

  const reveal = useSharedValue(motionEnabled ? 0 : 1);
  const compositionKey = segments.map((s) => s.id).join('|');

  // Drop a pinned callout when the period's categories change under it.
  // Adjusting state during render is React's recommended alternative to the
  // effect this would otherwise need.
  const [prevComposition, setPrevComposition] = useState(compositionKey);
  if (compositionKey !== prevComposition) {
    setPrevComposition(compositionKey);
    setSelectedId(null);
    setTipSize(null);
  }

  useEffect(() => {
    if (!motionEnabled) {
      reveal.value = 1;
      return;
    }
    reveal.value = 0;
    reveal.value = withTiming(1, {
      duration: motionDuration.chart,
      easing: motionEasing.out,
    });
  }, [compositionKey, motionEnabled, reveal]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { scale: 0.86 + reveal.value * 0.14 },
      { rotate: `${(1 - reveal.value) * -25}deg` },
    ],
  }));

  const selected = segments.find((s) => s.id === selectedId) ?? null;
  const anchor = selected ? polar(center, center, midRadius, selected.mid) : null;
  const tip = anchor && tipSize ? placeTip(anchor, tipSize, size) : null;

  const select = (id: string) => {
    // Drop the measurement with the selection: a wider label would otherwise
    // be positioned for one frame using the previous slice's width.
    setTipSize(null);
    setSelectedId(id === selectedId ? null : id);
  };

  return (
    <Animated.View
      style={[{ width: size, height: size, alignSelf: 'center' }, revealStyle]}
    >
      <Svg width={size} height={size}>
        <Defs>
          {segments.map((segment) => (
            <LinearGradient
              key={`grad-${segment.id}`}
              id={`slice-${segment.id}`}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop offset="0" stopColor={lighten(segment.color, 0.28)} />
              <Stop offset="1" stopColor={segment.color} />
            </LinearGradient>
          ))}
        </Defs>
        <Circle
          cx={center}
          cy={center}
          r={midRadius}
          stroke={theme.colors.surfaceVariant}
          strokeWidth={thickness}
          fill="none"
        />
        {segments.map((segment) => (
          <Path
            key={segment.id}
            d={wedgePath(
              center,
              segment.id === selectedId ? outerRadius + POP : outerRadius,
              innerRadius,
              segment.start,
              segment.end,
            )}
            fill={`url(#slice-${segment.id})`}
            onPress={() => select(segment.id)}
          />
        ))}
      </Svg>

      {selected && anchor ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedId(null)}
          onLayout={(event) => setTipSize(event.nativeEvent.layout)}
          style={[
            styles.tip,
            {
              backgroundColor: theme.colors.elevation.level3,
              borderColor: selected.color,
              maxWidth: size,
              // Placement needs the measured size, so the first frame after a
              // tap is laid out but not yet shown.
              opacity: tip ? 1 : 0,
              left: tip?.left ?? 0,
              top: tip?.top ?? 0,
            },
          ]}
        >
          <Text variant="labelMedium" numberOfLines={1} style={{ color: appColors.textDim }}>
            {selected.label}
          </Text>
          <Text
            variant="titleSmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface }}
          >
            {`${formatTotalCompactWithCurrency(
              selected.value,
              currency,
              language,
              selected.approx ?? false,
            )} · ${Math.round(selected.share * 100)}%`}
          </Text>
          <View
            style={[
              styles.arrow,
              {
                backgroundColor: theme.colors.elevation.level3,
                borderColor: selected.color,
                left: tip?.arrowLeft ?? 0,
                ...(tip?.above
                  ? { bottom: -ARROW, borderRightWidth: 1.5, borderBottomWidth: 1.5 }
                  : { top: -ARROW, borderLeftWidth: 1.5, borderTopWidth: 1.5 }),
              },
            ]}
          />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/**
 * One slice as a closed annular sector: out along the start edge, round the
 * outer rim, in along the end edge, back round the inner rim.
 *
 * A sector spanning the whole circle has coincident endpoints, which an arc
 * command draws as nothing at all, so a lone slice is split into two halves.
 */
function wedgePath(
  center: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  if (end - start >= TAU - 1e-6) {
    const half = start + Math.PI;
    return `${wedgePath(center, outer, inner, start, half)} ${wedgePath(center, outer, inner, half, start + TAU)}`;
  }
  const sweptOver180 = end - start > Math.PI ? 1 : 0;
  const o1 = polar(center, center, outer, start);
  const o2 = polar(center, center, outer, end);
  const i2 = polar(center, center, inner, end);
  const i1 = polar(center, center, inner, start);
  return [
    `M${o1.x} ${o1.y}`,
    `A${outer} ${outer} 0 ${sweptOver180} 1 ${o2.x} ${o2.y}`,
    `L${i2.x} ${i2.y}`,
    `A${inner} ${inner} 0 ${sweptOver180} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

/**
 * Sits the callout above the slice it points at, flipping below when the
 * slice is near the top of the ring, and never letting it leave the chart's
 * own box — the pointer slides along the callout instead.
 */
function placeTip(
  anchor: { x: number; y: number },
  tipSize: { width: number; height: number },
  size: number,
) {
  const above = anchor.y - tipSize.height - ARROW - TIP_GAP >= 0;
  const left = clamp(anchor.x - tipSize.width / 2, 0, Math.max(0, size - tipSize.width));
  return {
    above,
    left,
    top: above
      ? anchor.y - tipSize.height - ARROW - TIP_GAP
      : anchor.y + ARROW + TIP_GAP,
    arrowLeft: clamp(
      anchor.x - left - ARROW,
      ARROW,
      Math.max(ARROW, tipSize.width - ARROW * 3),
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  arrow: {
    position: 'absolute',
    width: ARROW * 2,
    height: ARROW * 2,
    transform: [{ rotate: '45deg' }],
  },
});
