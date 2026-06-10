/**
 * Add / edit expense dialog v2.
 *
 * Mirrors the web frontend's three-region layout:
 *   1. **Header tiles** — date, category, currency, all tappable.
 *   2. **Amount display** — current expression rendered like a calculator.
 *   3. **Numeric keypad** — `<AmountKeypad>` with calculator semantics.
 *
 * Used both for creating a new expense and editing an existing one
 * (`expense` prop). When editing, the existing per-expense `currency` is
 * preserved; new expenses default to the user's `mainCurrency`.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  HelperText,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ThemedButton } from './ThemedButton';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import { CurrencyPickerDialog } from './CurrencyPickerDialog';
import { SingleDatePickerDialog } from './DatePickerDialogs';
import { AmountKeypad } from './AmountKeypad';
import { HeaderTile } from './HeaderTile';
import { ExpenseSuggestionList } from './ExpenseSuggestionList';
import { PortalSafeTextInput } from './PortalSafeTextInput';
import { useCalculator } from '../utils/useCalculator';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
} from '../hooks/useExpenses';
import { useExpenseSuggestions } from '../hooks/useExpenseSuggestions';
import { useMainCurrency } from '../context/preferencesProvider';
import type { ExpenseProjection } from '../domain/types';

export interface AddExpenseDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly expense?: ExpenseProjection;
  readonly defaultCategoryId?: string;
}

/**
 * Outer shell — handles open/close lifecycle.
 *
 * Returns `null` while `visible` is `false`, so the stateful inner
 * component (`AddExpenseDialogShell`) unmounts every time the dialog
 * closes. State held there (description seed, calculator amount,
 * sub-picker flags, …) is therefore cleared between sessions without a
 * single `useEffect` reset block.
 *
 * The `key={expense?.id ?? 'new'}` prop on the inner component handles
 * the second reset trigger: when the parent flips the dialog from "edit
 * expense A" straight into "edit expense B" without closing in between,
 * React unmounts/remounts because the key changed. All `useState`/
 * `useReducer` initializers re-run naturally, including
 * `useCalculator`'s lazy seed.
 *
 * Description-suggestion prefill uses the same remount mechanism: when
 * the user taps a suggested previous expense from inside the form,
 * `suggestionSeed` is updated and `seedNonce` bumps, forcing the
 * innermost `AddExpenseDialogContent` to remount with the picked
 * expense fed in as `seedFrom`.
 *
 * If the user has already typed an amount before picking a suggestion,
 * that amount is preserved by overriding the seed's `amount` with the
 * current calculator value (in cents). The suggestion's amount is only
 * adopted when the user hasn't entered one yet. Other fields
 * (description, category, currency) always take the suggestion's value.
 *
 * `suggestionSeed` only applies in **create mode** — `props.expense`
 * always wins when present so an edit session never silently switches
 * its submit target.
 */
export function AddExpenseDialog(props: AddExpenseDialogProps) {
  if (!props.visible) return null;
  return <AddExpenseDialogShell key={props.expense?.id ?? 'new'} {...props} />;
}

function AddExpenseDialogShell(props: AddExpenseDialogProps) {
  const [suggestionSeed, setSuggestionSeed] = useState<ExpenseProjection | undefined>(undefined);
  const [seedNonce, setSeedNonce] = useState(0);

  return (
    <AddExpenseDialogContent
      key={seedNonce}
      onDismiss={props.onDismiss}
      expense={props.expense}
      seedFrom={suggestionSeed}
      defaultCategoryId={props.defaultCategoryId}
      onPickSuggestion={(picked, currentAmount) => {
        // If the user already entered a positive amount, keep it by
        // overriding the picked expense's amount before reseeding.
        const nextSeed =
          currentAmount != null && currentAmount > 0
            ? { ...picked, amount: Math.round(currentAmount * 100) }
            : picked;
        setSuggestionSeed(nextSeed);
        setSeedNonce((n) => n + 1);
      }}
    />
  );
}

interface AddExpenseDialogContentProps {
  readonly onDismiss: () => void;
  readonly expense: ExpenseProjection | undefined;
  readonly seedFrom: ExpenseProjection | undefined;
  readonly defaultCategoryId: string | undefined;
  readonly onPickSuggestion: (expense: ExpenseProjection, currentAmount: number | null) => void;
}

function AddExpenseDialogContent({
  onDismiss,
  expense,
  seedFrom,
  defaultCategoryId,
  onPickSuggestion,
}: AddExpenseDialogContentProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lookup = useCategoryLookup();
  const { mainCurrency } = useMainCurrency();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  // ---- Form state — seeded once per mount from the `expense` prop -------
  // In create mode, `seedFrom` (a description suggestion the user just
  // tapped) acts as a secondary seed. Edit mode always wins so the
  // submit target never silently changes.
  const seed = expense ?? seedFrom;
  const [description, setDescription] = useState(seed?.description ?? '');
  const [date, setDate] = useState<Date>(() =>
    expense?.date ? new Date(expense.date) : new Date(),
  );
  const [currency, setCurrency] = useState<string>(seed?.currency ?? mainCurrency);
  const [categoryId, setCategoryId] = useState<string | undefined>(
    seed?.categoryId ?? defaultCategoryId,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Tracks whether the user has typed into the description field since
  // this mount. Used to suppress the suggestion dropdown right after a
  // suggestion is picked (the form remounts with the picked description
  // pre-filled, which would otherwise immediately match itself).
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  // Sub-dialog visibility
  const [pickerOpen, setPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Calculator — `useCalculator` lazy-seeds via its `useReducer` initializer.
  const { expression, hasOperator, amount, dispatch } = useCalculator(
    seed ? seed.amount / 100 : null,
  );

  // Description-based autocomplete over previous expenses. Disabled in
  // edit mode (the user is fixing one specific entry, not creating a
  // new one) and until the user has actually typed into the field on
  // this mount.
  const suggestions = useExpenseSuggestions(description, {
    enabled: !expense && descriptionTouched,
  });

  const resolved = categoryId ? lookup.resolve(categoryId) : null;
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const shortDateLabel = isToday
    ? translate('common.today')
    : date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const fullDateFormatted = date.toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const fullDateLabel = isToday
    ? `${translate('common.today')}, ${fullDateFormatted}`
    : fullDateFormatted;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    if (!categoryId) {
      setError(translate('expenseDialog.pickCategoryError'));
      return;
    }
    if (amount === null || amount <= 0) {
      setError(translate('expenseDialog.positiveAmountError'));
      return;
    }
    const amountCents = Math.round(amount * 100);
    setSubmitting(true);
    try {
      if (expense) {
        await updateExpense.mutateAsync({
          id: expense.id,
          cmd: {
            description,
            amount: amountCents,
            currency,
            categoryId,
            date: date.toISOString(),
          },
        });
      } else {
        await createExpense.mutateAsync({
          description,
          amount: amountCents,
          currency,
          categoryId,
          date: date.toISOString(),
        });
      }
      onDismiss();
    } catch (e) {
      console.error('Failed to save expense', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // The keypad's equals/OK button does double duty: evaluate when there's
  // an operator pending; submit otherwise. Matches the web behaviour.
  const onEquals = (): void => {
    if (hasOperator) {
      dispatch({ type: 'evaluate' });
    } else {
      void handleSubmit();
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!expense) return;
    setSubmitting(true);
    try {
      await deleteExpense.mutateAsync(expense.id);
      onDismiss();
    } catch (e) {
      console.error('Failed to delete expense', e);
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  // Hide the main dialog while a sub-picker is showing — Portal-stacked
  // dialogs would visually overlap on RN Paper.
  const subOpen = pickerOpen || datePickerOpen || currencyPickerOpen;
  const overlayVisible = !subOpen;

  const dateColor = theme.colors.primary;
  const categoryColor = resolved?.color ?? theme.colors.tertiary;
  const opColor = theme.colors.tertiary;
  const isEdit = !!expense;

  return (
    <>
      {overlayVisible ? (
        // Bottom-sheet overlay rendered through Paper's <Portal>, which
        // teleports the children up to the root PaperProvider — above the
        // bottom tab bar — so the sheet can extend all the way to the
        // bottom of the screen and give the keypad more room. We still
        // avoid RN's <Modal> because it mounts in a separate native
        // window and brings platform-specific inset bugs; <Portal> is a
        // pure JS teleport that keeps us in the same React tree.
        <Portal>
        <Pressable
          style={[styles.overlay, { backgroundColor: theme.colors.backdrop }]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={translate('common.close')}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.kavWrapper}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => {}}
              accessible={false}
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.colors.background,
                  // Pad the bottom by the system gesture/home-indicator
                  // inset so the OK button isn't crushed under the
                  // navigation handle now that the sheet extends past
                  // the (previously protective) tab bar.
                  paddingBottom: insets.bottom,
                },
              ]}
            >
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {/* ---- Header tiles -------------------------------------- */}
                <View style={styles.tilesRow}>
                  <HeaderTile
                    label={translate('expenseDialog.date')}
                    value={shortDateLabel}
                    color={dateColor}
                    onPress={() => setDatePickerOpen(true)}
                  />
                  <HeaderTile
                    label={translate('expenseDialog.category')}
                    value={resolved?.name ?? translate('expenseDialog.pickCategory')}
                    color={categoryColor}
                    onPress={() => setPickerOpen(true)}
                  />
                </View>

                {/* ---- Amount display ------------------------------------ */}
                <View style={styles.amountBlock}>
                  <Text variant="bodySmall" style={{ color: opColor, letterSpacing: 0.5 }}>
                    {translate('expenseDialog.expense')}
                  </Text>
                  <View style={styles.amountRow}>
                    <Text style={[styles.amountCurrency, { color: opColor }]}>{currency}</Text>
                    <Text
                      style={[styles.amountValue, { color: opColor }]}
                      numberOfLines={1}
                    >
                      {expression || '0'}
                    </Text>
                  </View>
                </View>

                {/* ---- Description (italic, centered) --------------------
                  PortalSafeTextInput, not Paper's TextInput directly — see
                  PortalSafeTextInput.tsx for the Portal cursor-jump bug. */}
                <PortalSafeTextInput
                  mode="outlined"
                  placeholder={translate('expenseDialog.description')}
                  value={description}
                  onChangeText={(text) => {
                    setDescription(text);
                    setDescriptionTouched(true);
                  }}
                  dense
                  style={styles.descriptionInput}
                />

                <ExpenseSuggestionList
                  suggestions={suggestions}
                  onPick={(s) => onPickSuggestion(s, amount)}
                />

                {error ? <HelperText type="error">{error}</HelperText> : null}

                {/* ---- Keypad -------------------------------------------- */}
                <View style={styles.keypadWrapper}>
                  <AmountKeypad
                    currency={currency}
                    hasOperator={hasOperator}
                    canEquals={amount !== null && amount > 0}
                    disabled={submitting}
                    dispatch={dispatch}
                    onEquals={onEquals}
                    onOpenDate={() => setDatePickerOpen(true)}
                    onOpenCurrency={() => setCurrencyPickerOpen(true)}
                  />
                </View>

                {/* ---- Footer: (in edit mode) delete + full date --------- */}
                <View style={styles.footerRow}>
                  {isEdit ? (
                    // Two-step delete affordance, mirrors the web frontend's
                    // ExpenseDialogFooter: a low-emphasis text button promotes
                    // to a high-emphasis contained button on first tap so a
                    // second tap is required to actually destroy data.
                    confirmDelete ? (
                      <ThemedButton
                        mode="contained"
                        buttonColor={theme.colors.error}
                        textColor={theme.colors.onError}
                        compact
                        onPress={() => void handleDelete()}
                        disabled={submitting}
                        loading={submitting}
                      >
                        {submitting
                          ? translate('common.deleting')
                          : translate('common.confirmDelete')}
                      </ThemedButton>
                    ) : (
                      <ThemedButton
                        mode="text"
                        textColor={theme.colors.error}
                        compact
                        onPress={() => setConfirmDelete(true)}
                        disabled={submitting}
                      >
                        {translate('common.delete')}
                      </ThemedButton>
                    )
                  ) : null}
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={[
                      styles.footerDate,
                      isEdit ? null : styles.footerDateCentered,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {fullDateLabel}
                  </Text>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
        </Portal>
      ) : null}

      <CategoryPickerDialog
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        onPick={(id) => {
          setCategoryId(id);
          setPickerOpen(false);
        }}
      />

      <CurrencyPickerDialog
        visible={currencyPickerOpen}
        selected={currency}
        onDismiss={() => setCurrencyPickerOpen(false)}
        onPick={(c) => {
          setCurrency(c);
          setCurrencyPickerOpen(false);
        }}
      />

      <SingleDatePickerDialog
        visible={datePickerOpen}
        value={date}
        onDismiss={() => setDatePickerOpen(false)}
        onConfirm={(d) => {
          setDate(d);
          setDatePickerOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    // Rendered through <Portal> so it fills the entire window — covering
    // the bottom tab bar — and gives the keypad maximum vertical room.
    // Background color is set inline from `theme.colors.backdrop` so it
    // reacts to light/dark mode.
    zIndex: 10,
    elevation: 10,
  },
  kavWrapper: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '100%',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 12,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  amountBlock: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
    minHeight: 40,
  },
  amountCurrency: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.9,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '400',
  },
  descriptionInput: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  keypadWrapper: {
    marginTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
    minHeight: 36,
  },
  footerDate: {
    // Right-aligned next to the (left-anchored) delete button in edit
    // mode; centered standalone in create mode (see footerDateCentered).
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  footerDateCentered: {
    flex: 1,
    textAlign: 'center',
    marginLeft: 0,
  },
});
