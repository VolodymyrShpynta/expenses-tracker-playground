/**
 * Inline list of "previous-expense" suggestions rendered below the
 * description input on the add-expense sheet.
 *
 * Each row is a single tap-target ({@link TouchableRipple}) showing
 *   • category avatar (left)
 *   • description (top line)
 *   • amount + relative date (subtitle)
 *
 * Tapping a row delegates to {@link onPick}; the dialog re-seeds the
 * form (category, currency, amount, description) from the picked
 * expense by remounting the inner content with a new key.
 *
 * Visual style follows the same {@link TouchableRipple} + horizontal
 * row pattern used by {@link CategoryPickerDialog}, kept inline rather
 * than inside a {@link Dialog} so the dropdown stays anchored to the
 * description input and the user's typing keyboard stays open.
 */
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { CategoryAvatar } from './CategoryAvatar';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import { formatAmountWithCurrency } from '../utils/format';
import type { ExpenseProjection } from '../domain/types';

export interface ExpenseSuggestionListProps {
  readonly suggestions: ReadonlyArray<ExpenseProjection>;
  readonly onPick: (expense: ExpenseProjection) => void;
}

export function ExpenseSuggestionList({ suggestions, onPick }: ExpenseSuggestionListProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const lookup = useCategoryLookup();

  if (suggestions.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: theme.colors.outlineVariant,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <Text
        variant="labelSmall"
        style={[styles.header, { color: theme.colors.onSurfaceVariant }]}
      >
        {translate('expenseDialog.suggestionsHeader')}
      </Text>
      {suggestions.map((expense) => {
        const resolved = lookup.resolve(expense.categoryId);
        const subtitleParts: string[] = [
          formatAmountWithCurrency(expense.amount, expense.currency, i18n.language),
        ];
        if (expense.date) {
          subtitleParts.push(formatShortDate(expense.date, i18n.language));
        }
        return (
          <TouchableRipple
            key={expense.id}
            onPress={() => onPick(expense)}
            accessibilityRole="button"
            accessibilityLabel={translate('expenseDialog.suggestionAriaLabel', {
              description: expense.description ?? '',
            })}
          >
            <View style={styles.row}>
              <CategoryAvatar
                iconName={resolved.iconName}
                color={resolved.color}
                size={32}
              />
              <View style={styles.text}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {expense.description}
                </Text>
                <Text
                  variant="bodySmall"
                  numberOfLines={1}
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {subtitleParts.join(' · ')}
                </Text>
              </View>
            </View>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

/**
 * Short date label for the suggestion row, e.g. "May 12". Localised via
 * the active i18n language; the dialog's main date tile uses the same
 * format so the secondary line stays visually consistent.
 */
function formatShortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginTop: 6,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
  },
  text: {
    flex: 1,
    flexShrink: 1,
  },
});
