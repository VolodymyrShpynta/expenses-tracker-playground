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
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ThemedButton } from './ThemedButton';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import { CurrencyPickerDialog } from './CurrencyPickerDialog';
import { SingleDatePickerDialog } from './DatePickerDialogs';
import { AmountKeypad } from './AmountKeypad';
import { HeaderTile } from './HeaderTile';
import { useCalculator } from '../utils/useCalculator';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
} from '../hooks/useExpenses';
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
 * Mounts a fresh `AddExpenseDialogContent` every time the dialog is
 * opened (or the target `expense` changes) by keying it on the expense
 * id. This is the React-recommended way to "reset state when a prop
 * changes": every form field's `useState(...)` initializer is re-run
 * naturally, including `useCalculator`'s lazy seed — no manual reset
 * block, no digit-by-digit replay loop.
 */
export function AddExpenseDialog(props: AddExpenseDialogProps) {
  if (!props.visible) return null;
  return (
    <AddExpenseDialogContent
      key={props.expense?.id ?? 'new'}
      onDismiss={props.onDismiss}
      expense={props.expense}
      defaultCategoryId={props.defaultCategoryId}
    />
  );
}

interface AddExpenseDialogContentProps {
  readonly onDismiss: () => void;
  readonly expense: ExpenseProjection | undefined;
  readonly defaultCategoryId: string | undefined;
}

function AddExpenseDialogContent({
  onDismiss,
  expense,
  defaultCategoryId,
}: AddExpenseDialogContentProps) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const lookup = useCategoryLookup();
  const { mainCurrency } = useMainCurrency();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  // ---- Form state — seeded once per mount from the `expense` prop -------
  const [description, setDescription] = useState(expense?.description ?? '');
  const [date, setDate] = useState<Date>(() =>
    expense?.date ? new Date(expense.date) : new Date(),
  );
  const [currency, setCurrency] = useState<string>(expense?.currency ?? mainCurrency);
  const [categoryId, setCategoryId] = useState<string | undefined>(
    expense?.categoryId ?? defaultCategoryId,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sub-dialog visibility
  const [pickerOpen, setPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Calculator — `useCalculator` lazy-seeds via its `useReducer` initializer.
  const { expression, hasOperator, amount, dispatch } = useCalculator(
    expense ? expense.amount / 100 : null,
  );

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
        // Bottom-sheet overlay rendered *inside* the host tab screen.
        //
        // We deliberately do NOT use RN's <Modal>: <Modal> mounts in a
        // separate native window that sits above the entire activity —
        // including the bottom tab bar — which forces us to manually
        // reserve space for the tabs and creates platform-specific
        // inset bugs. By rendering an absolute overlay inside the
        // tab screen, the navigator's layout already excludes the tab
        // bar from our frame, so the sheet bottoms out exactly at the
        // top of the tabs with no measurement required.
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
                { backgroundColor: theme.colors.background },
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

                {/* ---- Description (italic, centered) -------------------- */}
                <TextInput
                  mode="outlined"
                  placeholder={translate('expenseDialog.description')}
                  value={description}
                  onChangeText={setDescription}
                  dense
                  style={styles.descriptionInput}
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
    // Sit above the tab screen's content but stay within its frame
    // (i.e. below the bottom tab bar, which the navigator renders
    // outside this view). Background color is set inline from
    // `theme.colors.backdrop` so it reacts to light/dark mode.
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
