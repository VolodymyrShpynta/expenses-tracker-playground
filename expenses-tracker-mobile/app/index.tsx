/**
 * Home screen — minimal scaffolding. Real expense list will be wired up
 * once `useExpenses` and `useExpenseMutations` hooks land alongside the
 * `add expense` bottom-sheet.
 *
 * The current implementation simply demonstrates the wiring: it reads the
 * shared `LocalStore` from context and renders translated copy. Visual
 * design will follow the web frontend's category-grouped layout.
 */
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useLocalStore } from '../src/db/databaseProvider';

export default function HomeScreen() {
  const { t: translate } = useTranslation();
  // `useLocalStore` will be the foundation for `useExpenses` / `useCategories`
  // hooks (Phase 5). Reading it here proves the provider chain is wired up.
  useLocalStore();

  return (
    <>
      <Stack.Screen options={{ title: translate('appName') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ gap: 12 }}>
          <Text variant="headlineSmall">{translate('appName')}</Text>
          <Text variant="bodyMedium">{translate('nav.transactions')}</Text>
        </View>
      </ScrollView>
    </>
  );
}
