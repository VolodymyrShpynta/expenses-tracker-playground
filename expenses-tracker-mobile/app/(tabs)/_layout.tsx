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

export default function TabsLayout() {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

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
        headerLeft: () => <MenuButton />,
        tabBarStyle: { backgroundColor: theme.colors.surface },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
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
