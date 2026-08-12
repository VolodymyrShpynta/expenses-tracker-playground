/**
 * Bottom-tab layout for the main screens. Mirrors the responsive
 * "bottom navigation on mobile" pattern from the web frontend.
 *
 * The tab bar uses MaterialIcons rather than `react-native-vector-icons`
 * so we don't pull in another icon font.
 *
 * Chrome follows the landing site's `.nav`: an elevated surface separated
 * from the page by a single hairline, no shadow. Headers stay transparent
 * so the root ambient glow runs behind them.
 */
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_SCALES, useFontScale } from '../../src/context/preferencesProvider';
import { useAppColors } from '../../src/theme/appColors';
import { tabBarBodyHeight, tabBarLabelFontSize } from '../../src/theme/tabBar';
import { interFont } from '../../src/theme/typography';

// Tab-bar height + label size (which scale with the font preference and must
// stay in sync with what `AppDialog` reserves) live in `src/theme/tabBar.ts`.

export default function TabsLayout() {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const appColors = useAppColors();
  const router = useRouter();
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];
  const insets = useSafeAreaInsets();
  const labelFontSize = tabBarLabelFontSize(fontScale);
  const tabBarHeight = tabBarBodyHeight(fontScale) + insets.bottom;

  const MenuButton = () => (
    <Pressable
      onPress={() => router.push('/settings')}
      hitSlop={12}
      style={{ paddingHorizontal: 12, paddingVertical: 8 }}
      accessibilityLabel={translate('nav.openMenu')}
    >
      <MaterialIcons name="menu" size={24} color={theme.colors.onSurface} />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: 'transparent' },
        headerShadowVisible: false,
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: {
          fontSize: Math.round(20 * scale),
          fontFamily: interFont.bold,
          letterSpacing: -0.4 * scale,
        },
        headerLeft: () => <MenuButton />,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: appColors.border,
          elevation: 0,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: appColors.textDim,
        tabBarLabelStyle: { fontSize: labelFontSize, fontFamily: interFont.semiBold },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: translate('nav.categories'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="donut-large" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: translate('nav.transactions'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="receipt-long" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="overview"
        options={{
          title: translate('nav.overview'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
