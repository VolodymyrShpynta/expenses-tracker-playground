/**
 * Currency picker dialog — search field + radio-button list of common
 * ISO codes. Built on `AppDialog` with the default close button so the
 * user can dismiss without committing to a different currency.
 *
 * When the search field is empty the user's currently selected currency
 * is pinned at the top, with the remainder sorted alphabetically. While
 * a query is present the list is a plain alphabetical, case-insensitive
 * substring match (no diacritic folding — ISO codes are ASCII).
 *
 * The list is intentionally curated rather than the full ISO 4217 set:
 * offering 200+ rows on a phone is more friction than value. The user
 * can still type any code in the AddExpense flow if needed (deferred).
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import {
  Dialog,
  RadioButton,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';

const CURRENCIES: ReadonlyArray<string> = [
  'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'AUD', 'CAD',
  'CZK', 'PLN', 'UAH', 'SEK', 'NOK', 'DKK', 'HUF', 'RON',
  'INR', 'TRY', 'ZAR', 'BRL', 'MXN', 'KRW', 'SGD', 'HKD', 'NZD',
];

export interface CurrencyPickerDialogProps {
  readonly visible: boolean;
  readonly selected: string;
  readonly onDismiss: () => void;
  readonly onPick: (code: string) => void;
}

export function CurrencyPickerDialog({
  visible,
  selected,
  onDismiss,
  onPick,
}: CurrencyPickerDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const sorted = [...CURRENCIES].sort();
    const q = query.trim().toLowerCase();
    if (!q) {
      const remaining = sorted.filter((c) => c !== selected);
      return [selected, ...remaining];
    }
    return sorted.filter((c) => c.toLowerCase().includes(q));
  }, [query, selected]);

  const handleDismiss = (): void => {
    setQuery('');
    onDismiss();
  };

  const handlePick = (code: string): void => {
    setQuery('');
    onPick(code);
  };

  return (
    <AppDialog
      visible={visible}
      onDismiss={handleDismiss}
      title={translate('currencyDialog.title')}
    >
      <Dialog.Content style={styles.content}>
        <TextInput
          mode="outlined"
          dense
          placeholder={translate('currencyDialog.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
          autoCorrect={false}
          left={<TextInput.Icon icon="magnify" />}
          right={
            query.length > 0 ? (
              <TextInput.Icon icon="close" onPress={() => setQuery('')} />
            ) : undefined
          }
          style={{ backgroundColor: theme.colors.surface }}
        />
      </Dialog.Content>
      <Dialog.ScrollArea style={styles.scrollArea}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {list.length === 0 ? (
            <Text
              style={[
                styles.emptyText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {translate('currencyDialog.noMatches')}
            </Text>
          ) : (
            <RadioButton.Group value={selected} onValueChange={handlePick}>
              {list.map((c) => (
                <RadioButton.Item key={c} value={c} label={c} />
              ))}
            </RadioButton.Group>
          )}
        </ScrollView>
      </Dialog.ScrollArea>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  emptyText: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
});
