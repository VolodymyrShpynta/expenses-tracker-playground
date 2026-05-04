/**
 * Root layout — mounts the global providers in the order:
 *   ErrorBoundary → SafeArea → Paper (theme) → I18next → Database → QueryClient → Stack
 *
 * Keep this file thin. Per-route layouts (e.g. tabs) belong in nested
 * `_layout.tsx` files under `app/`.
 *
 * The dark/light theme follows the device color scheme; a settings screen
 * can later add an override (mirrors `expenses-tracker-frontend`'s
 * `ColorModeContext`).
 */
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { I18nextProvider } from 'react-i18next';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';

import i18n, { initI18n } from '../src/i18n';
import { lightTheme, darkTheme } from '../src/theme/theme';
import { DatabaseProvider } from '../src/db/databaseProvider';
import { queryClient } from '../src/queryClient';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  // Init i18next exactly once. We don't render until it has resolved so
  // the first paint is already localized — avoids a flash of English keys.
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    void initI18n().then(() => setI18nReady(true));
  }, []);

  if (!i18nReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <I18nextProvider i18n={i18n}>
            <DatabaseProvider>
              <QueryClientProvider client={queryClient}>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: theme.colors.surface },
                    headerTintColor: theme.colors.onSurface,
                  }}
                />
              </QueryClientProvider>
            </DatabaseProvider>
          </I18nextProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
