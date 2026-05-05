/**
 * Category picker dialog — search field + scrollable list of the user's
 * categories. Built on top of `AppDialog` so it shares the title row,
 * close button, and themed background with every other picker.
 *
 * Filtering: case-insensitive substring match against the resolved
 * display name (no diacritic folding for now).
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Dialog,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import { CategoryAvatar } from './CategoryAvatar';
import { useCategories } from '../hooks/useCategories';
import { useCategoryLookup } from '../hooks/useCategoryLookup';

export interface CategoryPickerDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly onPick: (categoryId: string) => void;
}

export function CategoryPickerDialog({
  visible,
  onDismiss,
  onPick,
}: CategoryPickerDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const { categories } = useCategories();
  const lookup = useCategoryLookup();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = categories.map((c) => ({ id: c.id, ...lookup.resolve(c.id) }));
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [categories, lookup, query]);

  const handleDismiss = (): void => {
    setQuery('');
    onDismiss();
  };

  const handlePick = (id: string): void => {
    setQuery('');
    onPick(id);
  };

  return (
    <AppDialog
      visible={visible}
      onDismiss={handleDismiss}
      title={translate('categoryDialog.pickTitle')}
    >
      <Dialog.Content style={styles.content}>
        <TextInput
          mode="outlined"
          dense
          placeholder={translate('categoryDialog.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
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
          {filtered.length === 0 ? (
            <Text
              style={[
                styles.emptyText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {query
                ? translate('categoryDialog.noMatches')
                : translate('categoryDialog.empty')}
            </Text>
          ) : (
            filtered.map((row) => (
              <TouchableRipple key={row.id} onPress={() => handlePick(row.id)}>
                <View style={styles.row}>
                  <CategoryAvatar iconName={row.iconName} color={row.color} />
                  <Text
                    variant="bodyLarge"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {row.name}
                  </Text>
                </View>
              </TouchableRipple>
            ))
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyText: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
});
