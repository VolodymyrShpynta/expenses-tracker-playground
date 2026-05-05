/**
 * Root layout — mounts the global providers in order:
 *   GestureHandler → SafeArea → I18next → Database → QueryClient
 *      → AppServices (userId + domain services) → Preferences
 *      → ThemedPaper (consumes themeMode/fontScale prefs)
 *      → Stack
 *
 * The Paper provider sits inside Preferences so it can react to theme /
 * font-scale changes without remounting the entire tree.
 */
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import i18n, { initI18n } from '../src/i18n';
import { DatabaseProvider } from '../src/db/databaseProvider';
import { queryClient } from '../src/queryClient';
import { AppServicesProvider } from '../src/context/appServicesProvider';
import { PreferencesProvider, useThemeMode } from '../src/context/preferencesProvider';
import { ThemedPaperProvider } from '../src/theme/ThemedPaperProvider';

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    void initI18n().then(() => setI18nReady(true));
  }, []);

  if (!i18nReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <DatabaseProvider>
            <QueryClientProvider client={queryClient}>
              <AppServicesProvider>
                <PreferencesProvider>
                  <ThemedPaperProvider>
                    <ThemedStatusBar />
                    <Stack>
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen name="settings" />
                    </Stack>
                  </ThemedPaperProvider>
                </PreferencesProvider>
              </AppServicesProvider>
            </QueryClientProvider>
          </DatabaseProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Resolve the OS-vs-override theme decision and feed the right value to
 * the StatusBar. Lives inside `PreferencesProvider` so it can read the
 * preference; outside `ThemedPaperProvider` is fine because it doesn't
 * need the Paper theme.
 */
function ThemedStatusBar() {
  const systemScheme = useColorScheme();
  const { themeMode } = useThemeMode();
  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
