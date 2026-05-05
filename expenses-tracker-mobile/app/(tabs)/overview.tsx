/**
 * Overview screen — placeholder (matches the web frontend's intent: "Budget
 * overview and analytics coming soon"). Kept as a real route so the
 * bottom-tab strip mirrors the web layout.
 */
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

export default function OverviewScreen() {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  return (
    <>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text variant="titleMedium">{translate('expenses.overviewTitle')}</Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
        >
          {translate('expenses.overviewComingSoon')}
        </Text>
      </View>
    </>
  );
}
