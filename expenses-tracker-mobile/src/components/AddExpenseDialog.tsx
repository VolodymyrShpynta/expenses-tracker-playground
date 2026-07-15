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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
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
import { formatDate } from '../utils/dateRange';
import { useCategoryLookup } from '../hooks/useCategoryLookup';
import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
} from '../hooks/useExpenses';
import { useExpenseSuggestions } from '../hooks/useExpenseSuggestions';
import { FONT_SCALES, useFontScale, useMainCurrency } from '../context/preferencesProvider';
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
  const { height: windowHeight } = useWindowDimensions();
  // No CSS media queries in RN: derive a single screen-size multiplier from
  // the window height and scale the whole sheet (tile size, amount text,
  // spacing, keypad) from it. 1.0 on a typical ~760dp-tall phone, growing to
  // 1.3 on large / tall devices so the form fills big screens instead of
  // stranding a void above the keypad. Never below 1.0, so small phones stay
  // compact.
  const uiScale = Math.min(1.3, Math.max(1, windowHeight / 760));
  // The keypad's touch targets grow with height too (a touch more
  // aggressively), clamped to a comfortable 48–72dp range.
  const keypadCellHeight = Math.round(Math.min(72, Math.max(48, windowHeight * 0.068)));
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];
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
  // Memoized so the keypad-driven re-render on every digit press doesn't
  // re-run three `Intl` (`toLocaleDateString`) formats per keystroke —
  // those are comparatively expensive on a cold JS engine right after
  // launch. Only recompute when the date or active language changes.
  const { shortDateLabel, fullDateLabel } = useMemo(() => {
    const now = new Date();
    const today =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    const shortLabel = today
      ? translate('common.today')
      : date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
    const fullFormatted = formatDate(date, i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const fullLabel = today
      ? `${translate('common.today')}, ${fullFormatted}`
      : fullFormatted;
    return { shortDateLabel: shortLabel, fullDateLabel: fullLabel };
  }, [date, i18n.language, translate]);

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
  //
  // Kept identity-stable via a ref so the memoized `AmountKeypad` doesn't
  // re-render on every keystroke (the inline closure used to capture the
  // ever-changing `amount`/`handleSubmit`, defeating `memo`). The ref is
  // refreshed after each render with the latest logic, so behaviour is
  // unchanged while `onEquals` keeps a stable identity.
  const onEqualsRef = useRef<() => void>(() => {});
  useEffect(() => {
    onEqualsRef.current = (): void => {
      if (hasOperator) {
        dispatch({ type: 'evaluate' });
      } else {
        void handleSubmit();
      }
    };
  });
  const onEquals = useCallback(() => onEqualsRef.current(), []);
  const onOpenDate = useCallback(() => setDatePickerOpen(true), []);
  const onOpenCurrency = useCallback(() => setCurrencyPickerOpen(true), []);

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
                  // Cap at 90% of the ACTUAL window height (numeric, not a
                  // `%` string — a percentage here resolves against the
                  // auto-height KeyboardAvoidingView parent, not the screen,
                  // so it collapsed the sheet well below 90%). Leaves a
                  // backdrop strip above for tap-to-dismiss.
                  maxHeight: windowHeight * 0.9,
                  // Stretch to a floor of 80% of the screen so the sheet
                  // doesn't look lost on big/tall devices; the flexible
                  // spacer + taller keypad cells fill the extra height. On
                  // small screens the content is taller than this floor, so
                  // it has no effect there.
                  minHeight: windowHeight * 0.8,
                  // Pad the bottom by the system gesture/home-indicator
                  // inset so the OK button isn't crushed under the
                  // navigation handle now that the sheet extends past
                  // the (previously protective) tab bar.
                  paddingBottom: insets.bottom,
                },
              ]}
            >
              {/*
               * No in-sheet close button: the sheet is capped at 90% (see
               * `sheet.maxHeight`), so a backdrop strip is always exposed
               * above it to tap for dismissal — freeing this vertical space
               * for the form on small screens.
               */}
              <ScrollView
                contentContainerStyle={[
                  styles.scrollContent,
                  {
                    paddingHorizontal: Math.round(16 * uiScale),
                    paddingTop: Math.round(8 * uiScale),
                  },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {/* ---- Header tiles -------------------------------------- */}
                <View
                  style={[
                    styles.tilesRow,
                    {
                      gap: Math.round(8 * uiScale),
                      marginTop: Math.round(12 * uiScale),
                      marginBottom: Math.round(8 * uiScale),
                    },
                  ]}
                >
                  <HeaderTile
                    label={translate('expenseDialog.date')}
                    value={shortDateLabel}
                    color={dateColor}
                    sizeScale={uiScale}
                    onPress={() => setDatePickerOpen(true)}
                  />
                  <HeaderTile
                    label={translate('expenseDialog.category')}
                    value={resolved?.name ?? translate('expenseDialog.pickCategory')}
                    color={categoryColor}
                    sizeScale={uiScale}
                    onPress={() => setPickerOpen(true)}
                  />
                </View>

                {/* ---- Amount display ------------------------------------ */}
                <View
                  style={[
                    styles.amountBlock,
                    { marginTop: Math.round(20 * uiScale), marginBottom: Math.round(10 * uiScale) },
                  ]}
                >
                  <Text variant="bodySmall" style={{ color: opColor, letterSpacing: 0.5 }}>
                    {translate('expenseDialog.expense')}
                  </Text>
                  <View
                    style={[
                      styles.amountRow,
                      { gap: Math.round(8 * uiScale), minHeight: Math.round(36 * uiScale) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.amountCurrency,
                        { color: opColor, fontSize: Math.round(16 * scale * uiScale) },
                      ]}
                    >
                      {currency}
                    </Text>
                    <Text
                      style={[
                        styles.amountValue,
                        { color: opColor, fontSize: Math.round(28 * scale * uiScale) },
                      ]}
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
                {/* The wrapper flex-grows to claim the vertical space left
                    under the amount / description; the keypad itself flex-fills
                    it (its rows and cells are flex-sized), so the buttons reach
                    full size on the first paint — no measure-then-grow. Using
                    `flexGrow` with the default auto basis (not `flex: 1`) keeps
                    it content-sized on short screens so the sheet just scrolls. */}
                <View
                  style={[
                    styles.keypadWrapper,
                    styles.keypadFill,
                    { marginTop: Math.round(8 * uiScale) },
                  ]}
                >
                  <AmountKeypad
                    currency={currency}
                    hasOperator={hasOperator}
                    canEquals={amount !== null && amount > 0}
                    disabled={submitting}
                    cellHeight={keypadCellHeight}
                    dispatch={dispatch}
                    onEquals={onEquals}
                    onOpenDate={onOpenDate}
                    onOpenCurrency={onOpenCurrency}
                  />
                </View>

                {/* ---- Footer: (in edit mode) delete + full date --------- */}
                <View style={styles.footerRow}>
                  {isEdit ? (
                    // Two-step delete affordance, mirrors the web frontend's
                    // ExpenseDialogFooter: a low-emphasis text button promotes
                    // to a high-emphasis contained button on first tap so a
                    // second tap is required to actually destroy data. On the
                    // confirm step the red button owns the whole row (and the
                    // date steps aside) so the long localized "Confirm
                    // deletion" label stays on one line instead of squeezing
                    // the date into an ellipsis.
                    confirmDelete ? (
                      <ThemedButton
                        mode="contained"
                        buttonColor={theme.colors.error}
                        textColor={theme.colors.onError}
                        compact
                        style={styles.confirmDeleteButton}
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
                  {isEdit && confirmDelete ? null : (
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
                  )}
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
        </Portal>
      ) : null}

      {pickerOpen ? (
        <CategoryPickerDialog
          visible
          onDismiss={() => setPickerOpen(false)}
          onPick={(id) => {
            setCategoryId(id);
            setPickerOpen(false);
          }}
        />
      ) : null}

      {currencyPickerOpen ? (
        <CurrencyPickerDialog
          visible
          selected={currency}
          onDismiss={() => setCurrencyPickerOpen(false)}
          onPick={(c) => {
            setCurrency(c);
            setCurrencyPickerOpen(false);
          }}
        />
      ) : null}

      {datePickerOpen ? (
        <SingleDatePickerDialog
          visible
          value={date}
          onDismiss={() => setDatePickerOpen(false)}
          onConfirm={(d) => {
            setDate(d);
            setDatePickerOpen(false);
          }}
        />
      ) : null}
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
    // Rendered through <Portal> so the backdrop fills the entire window —
    // covering the bottom tab bar — while the sheet itself is capped (see
    // `sheet.maxHeight`) and anchored to the bottom. Background color is set
    // inline from `theme.colors.backdrop` so it reacts to light/dark mode.
    zIndex: 10,
    // No Android `elevation` here: on a full-screen <Portal> backdrop it
    // renders a stray shadow line at the screen edge. <Portal> already
    // teleports this above everything (incl. the tab bar), so `zIndex`
    // alone is enough for stacking.
  },
  kavWrapper: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    // maxHeight is set inline from the window height (see the render) so it
    // caps at a true 90% of the screen; the body scrolls only if it can't
    // fit (and to keep an input visible above the keyboard).
  },
  scrollContent: {
    // Fill the sheet so the flexible spacer below can push the keypad to the
    // bottom on tall screens; on short screens the content overflows and
    // scrolls as before.
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  amountBlock: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 0,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 0,
    minHeight: 36,
  },
  amountCurrency: {
    fontWeight: '500',
    opacity: 0.9,
  },
  amountValue: {
    fontWeight: '400',
  },
  descriptionInput: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  keypadWrapper: {
    marginTop: 4,
  },
  keypadFill: {
    // Grow to fill the space left under the amount / description; the keypad
    // itself flex-fills this wrapper (its rows/cells are flex-sized), so the
    // buttons reach full size on the first paint. `flexGrow` with the default
    // `auto` basis means that on short screens where the content overflows it
    // just stays content-sized and the ScrollView scrolls (unlike `flex: 1`,
    // whose 0 basis would collapse it).
    flexGrow: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 4,
    minHeight: 28,
  },
  footerDate: {
    // Fills the row's remaining space and right-aligns the date next to the
    // (left-anchored) delete button in edit mode; centered standalone in
    // create mode (see footerDateCentered). Use `flex: 1` (a definite
    // remaining width), NOT `flexShrink: 1`: a flexShrink box sizes to its
    // content first and Yoga then truncated it inconsistently — a SHORTER
    // date ("15 лип. 2026 р.") could ellipsize while a LONGER one
    // ("Сьогодні, 16 лип. 2026 р.") fit. A flex-basis of 0 skips that step.
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  footerDateCentered: {
    flex: 1,
    textAlign: 'center',
    marginLeft: 0,
  },
  confirmDeleteButton: {
    // On the confirm step the delete button owns the whole footer row so the
    // long localized "Confirm deletion" label stays on one line.
    flex: 1,
  },
});
