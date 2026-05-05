/**
 * Category donut chart — pure SVG, no external charting library.
 *
 * Mobile counterpart of the web `CategoryDonutChart`. Each input slice
 * becomes a circular-arc `<Path>` between two angles. We draw the
 * stroke-only ring (so the centre stays empty for a label) by building
 * the actual filled annulus geometry rather than using `strokeWidth`,
 * which lets us colour each slice independently.
 *
 * Empty input → renders a muted background ring + the formatted total.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from 'react-native-paper';

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
          {centerValue ? (
            <SvgText
              x={radius}
              y={radius - 2}
              fill={theme.colors.onSurface}
              fontSize={Math.round(size * 0.13)}
              fontWeight="700"
              textAnchor="middle"
            >
              {centerValue}
            </SvgText>
          ) : null}
          {centerLabel ? (
            <SvgText
              x={radius}
              y={radius + Math.round(size * 0.11)}
              fill={theme.colors.onSurfaceVariant}
              fontSize={Math.round(size * 0.06)}
              textAnchor="middle"
            >
              {centerLabel}
            </SvgText>
          ) : null}
        </G>
      </Svg>
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
