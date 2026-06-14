/**
 * Root layout — mounts the global providers in order:
 *   GestureHandler → SafeArea → I18next → Database → QueryClient
 *      → AppServices (domain services) → Preferences
 *      → Sync (cloud-drive engine, depends on store + queryClient)
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
import {
  FONT_SCALES,
  PreferencesProvider,
  useFontScale,
  useThemeMode,
} from '../src/context/preferencesProvider';
import { SyncProvider } from '../src/context/syncProvider';
import { ThemedPaperProvider } from '../src/theme/ThemedPaperProvider';
import { useExchangeRatesSync } from '../src/hooks/useExchangeRatesSync';

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
                  <SyncProvider>
                    <ThemedPaperProvider>
                      <ThemedStatusBar />
                      <ExchangeRatesSyncMounter />
                      <ScaledRootStack />
                    </ThemedPaperProvider>
                  </SyncProvider>
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
 * Wraps the root `<Stack>` so we can apply the user's `fontScale` to
 * `headerTitleStyle`. React Navigation's headers don't read Paper's
 * theme, so the Settings header title (and any future stack-level
 * headers) stays at React Navigation's default 17 px unless we scale it
 * here.
 */
function ScaledRootStack() {
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: Math.round(20 * scale) } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" />
    </Stack>
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

/**
 * Headless mount-point for `useExchangeRatesSync`. The hook needs access
 * to `DatabaseProvider`, `AppServices`, `Preferences`, and
 * `QueryClientProvider`, all of which are above it in the tree. It
 * returns nothing; it just schedules the background refresh side effect.
 */
function ExchangeRatesSyncMounter() {
  useExchangeRatesSync();
  return null;
}
