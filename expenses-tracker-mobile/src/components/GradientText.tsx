/**
 * Text painted with a gradient — the site's hero heading treatment
 * (`background: linear-gradient(135deg, …); background-clip: text`).
 *
 * CSS clips a gradient to the glyphs; React Native has no equivalent, so
 * the text is used as a mask over a `LinearGradient`. The mask element
 * and the (invisible) sizing copy must render identical text with
 * identical styles, otherwise the gradient box and the glyphs disagree.
 *
 * Takes an explicit `style` rather than a Paper `variant` because the
 * mask needs a concrete font size to lay out against.
 */
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Text } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

export interface GradientTextProps {
  readonly children: string;
  readonly colors: readonly [string, string, ...string[]];
  readonly style?: StyleProp<TextStyle>;
  /**
   * Sizes the mask. `adjustsFontSizeToFit` needs a bounded width to shrink
   * against, and the mask otherwise collapses to its content.
   */
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly numberOfLines?: number;
  readonly adjustsFontSizeToFit?: boolean;
  readonly minimumFontScale?: number;
  readonly accessibilityLabel?: string;
}

export function GradientText({
  children,
  colors,
  style,
  containerStyle,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
  accessibilityLabel,
}: GradientTextProps) {
  const textProps = {
    ...(numberOfLines === undefined ? {} : { numberOfLines }),
    ...(adjustsFontSizeToFit === undefined ? {} : { adjustsFontSizeToFit }),
    ...(minimumFontScale === undefined ? {} : { minimumFontScale }),
  };

  return (
    <MaskedView
      // The gradient is decorative; screen readers get the string once.
      accessible
      accessibilityLabel={accessibilityLabel ?? children}
      style={containerStyle}
      maskElement={
        <Text {...textProps} style={[style, { color: '#000' }]}>
          {children}
        </Text>
      }
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {/* Invisible copy: gives the gradient the glyphs' exact box. */}
        <Text {...textProps} style={[style, { opacity: 0 }]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}
