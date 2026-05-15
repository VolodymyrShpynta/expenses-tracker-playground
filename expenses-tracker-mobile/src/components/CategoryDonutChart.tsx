/**
 * Category donut chart — pure SVG, no external charting library.
 *
 * Mobile counterpart of the web `CategoryDonutChart`. Each input slice
 * becomes a circular-arc `<Path>` between two angles. We draw the
 * stroke-only ring (so the centre stays empty for a label) by building
 * the actual filled annulus geometry rather than using `strokeWidth`,
 * which lets us colour each slice independently.
 *
 * The centre label is rendered as native `<Text>` overlaid on top of
 * the SVG (not as `<SvgText>`) so we can use `adjustsFontSizeToFit` to
 * guarantee long currency totals (e.g. `CZK 1 166 326`) auto-shrink to
 * fit inside the inner disc instead of overlapping the ring. The
 * overlay's width is clamped to the inner disc's chord so `numberOfLines`
 * + `adjustsFontSizeToFit` has a hard boundary to scale against.
 *
 * Empty input → renders a muted background ring + the formatted total.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Text, useTheme } from 'react-native-paper';

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

export function CategoryDonutChart({
  slices,
  size = 220,
  thickness = 28,
  centerLabel,
  centerValue,
}: CategoryDonutChartProps) {
  const theme = useTheme();
  const radius = size / 2;
  const innerRadius = radius - thickness;

  const total = useMemo(
    () => slices.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0),
    [slices],
  );

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let acc = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const startAngle = (acc / total) * 2 * Math.PI;
        acc += s.value;
        const endAngle = (acc / total) * 2 * Math.PI;
        return {
          id: s.id,
          color: s.color,
          d: annulusPath(radius, radius, innerRadius, radius, startAngle, endAngle),
        };
      });
  }, [slices, total, innerRadius, radius]);

  const muted = theme.colors.surfaceVariant;

  // Centre text overlay geometry. The inner disc has diameter `2*innerRadius`,
  // but a single line of text sitting on the horizontal diameter would touch
  // the ring at its widest point — so we shrink the usable width by an 8%
  // safety margin and let `adjustsFontSizeToFit` shrink the font further if
  // the formatted total is unusually long.
  const innerWidth = Math.max(0, Math.floor(innerRadius * 2 * 0.92));
  const valueFontSize = Math.round(size * 0.13);
  const labelFontSize = Math.round(size * 0.06);

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        <G>
          {/* Background ring (or sole ring when empty) */}
          <Circle
            cx={radius}
            cy={radius}
            r={(radius + innerRadius) / 2}
            stroke={muted}
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((a) => (
            <Path key={a.id} d={a.d} fill={a.color} />
          ))}
        </G>
      </Svg>
      {centerValue || centerLabel ? (
        <View
          // `pointerEvents="none"` keeps the overlay from swallowing taps
          // on the donut (currently a no-op but future legend / drill-down
          // gestures would rely on this).
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
                // Allow shrinking to half-size before truncating with "…" —
                // enough headroom for the longest realistic currency totals
                // (e.g. `CZK 1 166 326`, `UAH 9 999 999`) without going so
                // small the number becomes unreadable.
                minimumFontScale={0.5}
                style={{
                  fontSize: valueFontSize,
                  fontWeight: '700',
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
                  fontSize: labelFontSize,
                  textAlign: 'center',
                  color: theme.colors.onSurfaceVariant,
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

/**
 * Build an SVG path string for a filled annular sector — the donut
 * "wedge" shape between two radii and two angles. Angles are in
 * radians, measured clockwise from 12 o'clock.
 */
function annulusPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  // SVG cannot draw a single arc covering ≥ 360°; treat near-full as two arcs.
  if (sweep >= 2 * Math.PI - 1e-6) {
    return [
      ringPath(cx, cy, rOuter),
      ringPath(cx, cy, rInner, true),
    ].join(' ');
  }
  const largeArc = sweep > Math.PI ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startAngle);
  const p2 = polar(cx, cy, rOuter, endAngle);
  const p3 = polar(cx, cy, rInner, endAngle);
  const p4 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

function ringPath(cx: number, cy: number, r: number, reverse = false): string {
  // Two-arc trick — SVG can't sweep a full 360° arc in one segment.
  const a = polar(cx, cy, r, 0);
  const b = polar(cx, cy, r, Math.PI);
  const sweep = reverse ? 0 : 1;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 1 ${sweep} ${b.x} ${b.y} A ${r} ${r} 0 1 ${sweep} ${a.x} ${a.y} Z`;
}

function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  // Convert angle (clockwise from 12 o'clock) to SVG cartesian (origin top-left, y-down).
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}
