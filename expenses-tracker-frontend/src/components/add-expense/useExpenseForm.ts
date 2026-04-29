import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { CurrencyCode } from '../../api/exchange.ts';
import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
} from '../../hooks/useExpenseMutations.ts';
import { useMainCurrency } from '../../hooks/useCurrency.ts';
import type { CategoryLookup } from '../../hooks/useCategoryLookup.ts';
import type { Expense } from '../../types/expense.ts';
import { useCalculator } from '../amount-keypad/useCalculator.ts';

interface UseExpenseFormOptions {
  expense?: Expense;
  defaultCategoryId: string;
  categoryLookup: CategoryLookup;
  onClose: () => void;
}

/**
 * Owns all the local state and persistence logic for the AddExpenseDialog.
 * Splits cleanly along three concerns: editable fields (`useState`),
 * derived calculator state (`useCalculator`), and TanStack Query mutations.
 */
export function useExpenseForm({
  expense,
  defaultCategoryId,
  categoryLookup,
  onClose,
}: UseExpenseFormOptions) {
  const { t: translate } = useTranslation();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const { mainCurrency } = useMainCurrency();

  const isEdit = Boolean(expense);
  const [description, setDescription] = useState(expense?.description ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(
    (expense?.currency as CurrencyCode) ?? mainCurrency,
  );
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? defaultCategoryId);
  const [date, setDate] = useState<Dayjs>(expense ? dayjs(expense.date) : dayjs());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const calculator = useCalculator(expense ? expense.amount / 100 : null);

  const resetAndClose = () => {
    if (!isEdit) {
      setDescription('');
      setCategoryId('');
      setCurrency(mainCurrency);
      setDate(dayjs());
      calculator.dispatch({ type: 'reset' });
    }
    setValidationError(null);
    setConfirmDelete(false);
    onClose();
  };

  const validate = (): string | null => {
    if (!categoryId) return translate('expenseDialog.pickCategoryError');
    if (calculator.amount === null || calculator.amount <= 0) {
      return translate('expenseDialog.positiveAmountError');
    }
    return null;
  };

  const buildRequest = () => {
    // amount is guarded by validate() above; non-null assertion is safe here.
    const amountCents = Math.round(calculator.amount! * 100);
    const categoryName = categoryLookup.resolve(categoryId).name;
    return {
      description: description.trim() || categoryName,
      amount: amountCents,
      currency,
      categoryId,
      date: date.toISOString(),
    };
  };

  const save = () => {
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    const req = buildRequest();
    if (expense) {
      updateExpense.mutate({ id: expense.id, req }, { onSuccess: resetAndClose });
    } else {
      createExpense.mutate(req, { onSuccess: resetAndClose });
    }
  };

  const remove = () => {
    if (!expense) return;
    deleteExpense.mutate(expense.id, { onSuccess: resetAndClose });
  };

  const isPending =
    createExpense.isPending || updateExpense.isPending || deleteExpense.isPending;

  const mutationError =
    (createExpense.error instanceof Error ? createExpense.error.message : null) ??
    (updateExpense.error instanceof Error ? updateExpense.error.message : null) ??
    (deleteExpense.error instanceof Error ? deleteExpense.error.message : null);

  return {
    isEdit,
    description,
    setDescription,
    currency,
    setCurrency,
    categoryId,
    setCategoryId,
    date,
    setDate,
    confirmDelete,
    setConfirmDelete,
    calculator,
    save,
    remove,
    resetAndClose,
    isPending,
    deletePending: deleteExpense.isPending,
    error: validationError ?? mutationError,
  };
}
