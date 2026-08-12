/**
 * Small uppercase pill that labels a section — the site's `.eyebrow`
 * ("WHY SPENDIUM"): 13px, weight 600, `0.08em` tracking, brand-50 fill.
 */
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';
import { useAppColors } from '../theme/appColors';
import { radius } from '../theme/tokens';
import { interFont } from '../theme/typography';

export interface EyebrowProps {
  readonly children: string;
  readonly style?: StyleProp<ViewStyle>;
}

const EYEBROW_SIZE = 13;

export function Eyebrow({ children, style }: EyebrowProps) {
  const appColors = useAppColors();
  const { fontScale } = useFontScale();
  const size = Math.round(EYEBROW_SIZE * FONT_SCALES[fontScale]);
  return (
    <View style={[styles.pill, { backgroundColor: appColors.eyebrowBg }, style]}>
      <Text
        numberOfLines={1}
        style={{
          color: appColors.eyebrowText,
          fontFamily: interFont.semiBold,
          fontSize: size,
          letterSpacing: size * 0.08,
        }}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
});
