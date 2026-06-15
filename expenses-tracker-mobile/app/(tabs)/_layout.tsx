/**
 * Bottom-tab layout for the main screens. Mirrors the responsive
 * "bottom navigation on mobile" pattern from the web frontend.
 *
 * The tab bar uses MaterialIcons rather than `react-native-vector-icons`
 * so we don't pull in another icon font.
 */
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_SCALES, useFontScale } from '../../src/context/preferencesProvider';

// React Navigation's default bottom-tab height (UIKit variant) is
// sized for the library's default 10 px label. Our label is 12 × scale,
// so even at scale = 1.0 it overflows the 49 px content area and
// collides with the system nav bar. We add 2 px of bar height for every
// extra px of label size (≈ label line-height), then add `insets.bottom`
// so the content sits clear of the gesture / 3-button nav strip.
const DEFAULT_TAB_BAR_HEIGHT = 49;
const DEFAULT_LABEL_FONT_SIZE = 10;

export default function TabsLayout() {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];
  const insets = useSafeAreaInsets();
  const labelFontSize = Math.round(12 * scale);
  const labelOverhead = Math.max(0, labelFontSize - DEFAULT_LABEL_FONT_SIZE);
  const tabBarHeight = DEFAULT_TAB_BAR_HEIGHT + labelOverhead * 2 + insets.bottom;

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
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontSize: Math.round(20 * scale) },
        headerLeft: () => <MenuButton />,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarLabelStyle: { fontSize: labelFontSize },
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
