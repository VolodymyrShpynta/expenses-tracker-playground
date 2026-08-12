/**
 * The three radial washes that sit behind every screen — the landing
 * page's hero ambience, ported to SVG.
 *
 * CSS gets this from three stacked `radial-gradient()` layers; React
 * Native has no radial gradient, and `expo-linear-gradient` is linear
 * only, so each ellipse becomes an `<Svg>` rect filled with a
 * `<RadialGradient>`. The stop geometry lives in `appColors.ambientGlow`
 * so the numbers stay next to the rest of the palette.
 *
 * Fixed to the viewport rather than scrolling with content, matching the
 * site, where the glow is painted on the hero section and stays put.
 */
import { useId } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTheme } from 'react-native-paper';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useAppColors } from '../theme/appColors';

/**
 * Alpha multipliers sampling `(1 - t)²` across the gradient's radius.
 *
 * A two-stop gradient ramps alpha *linearly* and then clamps at zero, and the
 * eye picks up that break in slope as a visible disc edge — the thing that
 * makes a wash read as a shape rather than as light. Easing into zero, with
 * the curve almost flat as it lands, removes the edge entirely.
 */
const FALLOFF = [
  { offset: 0, alpha: 1 },
  { offset: 0.25, alpha: 0.5625 },
  { offset: 0.5, alpha: 0.25 },
  { offset: 0.75, alpha: 0.0625 },
  { offset: 1, alpha: 0 },
] as const;

export function AmbientGlow() {
  const theme = useTheme();
  const appColors = useAppColors();
  const { width, height } = useWindowDimensions();
  // Gradient ids share one namespace across mounted SVGs, and the tab
  // navigator keeps all three screens alive at once. React's `useId`
  // emits colons, which are not valid in a URL fragment.
  const prefix = `glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          {appColors.ambientGlow.map((glow, index) => (
            <RadialGradient
              key={`${prefix}-${index}`}
              id={`${prefix}-${index}`}
              cx={glow.cx}
              cy={glow.cy}
              rx={glow.rx}
              ry={glow.ry}
            >
              {FALLOFF.map(({ offset, alpha }) => (
                <Stop
                  key={offset}
                  offset={offset}
                  stopColor={glow.color}
                  stopOpacity={glow.opacity * alpha}
                />
              ))}
            </RadialGradient>
          ))}
        </Defs>
        {appColors.ambientGlow.map((_, index) => (
          <Rect
            key={`${prefix}-fill-${index}`}
            x={0}
            y={0}
            width={width}
            height={height}
            fill={`url(#${prefix}-${index})`}
          />
        ))}
      </Svg>
    </View>
  );
}
