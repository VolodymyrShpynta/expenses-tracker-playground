/**
 * Category donut chart — pure SVG, no external charting library.
 *
 * Slices are stroked arcs on a shared circle rather than filled annular
 * wedges: a stroke gives round end caps and a gap between neighbours for
 * free, which is what makes the ring read as a set of separate segments
 * instead of a pie with lines drawn on it. Each slice is painted with its
 * own two-stop gradient (its colour, lightened at the head) so the ring
 * has the same depth as the gradients elsewhere in the app.
 *
 * The centre label is native `<Text>` overlaid on the SVG (not
 * `<SvgText>`) so `adjustsFontSizeToFit` can shrink long currency totals
 * (e.g. `CZK 1 166 326`) to fit the inner disc. The overlay is clamped to
 * the disc's chord so there's a hard boundary to scale against.
 *
 * Motion is a fade-scale-unwind on the container — a plain view transform,
 * so it can't interact with SVG rendering. Empty input renders the muted
 * track ring on its own.
 */
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';
import { Text, useTheme } from 'react-native-paper';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppColors } from '../theme/appColors';
import { motionDuration, motionEasing, useMotionEnabled } from '../theme/motion';
import { interFont } from '../theme/typography';
import { lighten } from '../utils/colorContrast';

export interface DonutSlice {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

export interface CategoryDonutChartProps {
  readonly slices: ReadonlyArray<DonutSlice>;
  readonly size?: number;
  readonly thickness?: number;
  readonly centerLabel?: string;
  readonly centerValue?: string;
}

/** Visible gap between neighbouring segments, in px of arc length. */
const SEGMENT_GAP = 5;

export function CategoryDonutChart({
  slices,
  size = 220,
  thickness = 26,
  centerLabel,
  centerValue,
}: CategoryDonutChartProps) {
  const theme = useTheme();
  const appColors = useAppColors();
  const motionEnabled = useMotionEnabled();

  const center = size / 2;
  // Stroke straddles the path, so the ring's centreline sits half a
  // stroke inside the box.
  const trackRadius = center - thickness / 2;
  const circumference = 2 * Math.PI * trackRadius;

  const total = useMemo(
    () => slices.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0),
    [slices],
  );

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let consumed = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const arcLength = (s.value / total) * circumference;
        const offset = consumed;
        consumed += arcLength;
        // Round caps add half a stroke of arc at each end, so the dash is
        // shortened by a full stroke to land back on the intended length.
        // Tiny slices clamp to a hairline and render as a single dot.
        const dash = Math.max(0.5, arcLength - thickness - SEGMENT_GAP);
        return {
          id: s.id,
          color: s.color,
          dash,
          // Negative offset advances clockwise from the 12 o'clock rotation.
          dashOffset: -(offset + (arcLength - dash) / 2),
        };
      });
  }, [slices, total, circumference, thickness]);

  const reveal = useSharedValue(motionEnabled ? 0 : 1);
  const compositionKey = segments.map((s) => s.id).join('|');

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

  // Inner disc geometry for the centre overlay. A single line sitting on the
  // horizontal diameter would touch the ring at its widest point, so the
  // usable width loses an 8% safety margin.
  const innerRadius = center - thickness;
  const innerWidth = Math.max(0, Math.floor(innerRadius * 2 * 0.92));
  const valueFontSize = Math.round(size * 0.135);
  const labelFontSize = Math.round(size * 0.058);

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Animated.View style={[{ width: size, height: size }, revealStyle]}>
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
          {/*
           * Rotate so arcs start at 12 o'clock instead of 3. SVG's transform
           * string carries the pivot with it; the array form rotates about the
           * element's own centre, and the `origin*` props that used to supply
           * a pivot are deprecated.
           */}
          <G transform={`rotate(-90, ${center}, ${center})`}>
            <Circle
              cx={center}
              cy={center}
              r={trackRadius}
              stroke={theme.colors.surfaceVariant}
              strokeWidth={thickness}
              fill="none"
            />
            {segments.map((segment) => (
              <Circle
                key={segment.id}
                cx={center}
                cy={center}
                r={trackRadius}
                stroke={`url(#slice-${segment.id})`}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={[segment.dash, circumference - segment.dash]}
                strokeDashoffset={segment.dashOffset}
                fill="none"
              />
            ))}
          </G>
        </Svg>
      </Animated.View>

      {centerValue || centerLabel ? (
        <View
          // Keeps the overlay from swallowing taps on the ring (a no-op
          // today, but future drill-down gestures would rely on it).
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: innerWidth, alignItems: 'center' }}>
            {centerValue ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                // Half-size headroom covers the longest realistic totals
                // (`CZK 1 166 326`, `UAH 9 999 999`) before the ellipsis.
                minimumFontScale={0.5}
                style={{
                  fontFamily: interFont.extraBold,
                  fontSize: valueFontSize,
                  letterSpacing: -0.03 * valueFontSize,
                  textAlign: 'center',
                  color: theme.colors.onSurface,
                }}
              >
                {centerValue}
              </Text>
            ) : null}
            {centerLabel ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{
                  marginTop: 4,
                  fontFamily: interFont.medium,
                  fontSize: labelFontSize,
                  textAlign: 'center',
                  color: appColors.textDim,
                }}
              >
                {centerLabel}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
