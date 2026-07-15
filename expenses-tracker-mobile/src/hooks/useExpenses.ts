/**
 * TanStack Query wrappers over `ExpenseQueryService` / `ExpenseCommandService`.
 *
 * Components must consume these hooks rather than calling the domain
 * services directly — same separation the web frontend enforces.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

import { EXPENSES_QUERY_KEY } from '../queryClient';
import { useAppServices } from '../context/appServicesProvider';
import { useWriteSideEffects } from './useWriteSideEffects';
import type {
  CreateExpenseCommand,
  UpdateExpenseCommand,
} from '../domain/commands';
import type { ExpenseProjection } from '../domain/types';

export interface UseExpensesOptions {
  readonly enabled?: boolean;
}

export function useExpenses(options: UseExpensesOptions = {}) {
  const { expenseQueries } = useAppServices();
  const { enabled = true } = options;
  const { data: expenses = [], isLoading: loading, error } = useQuery<ReadonlyArray<ExpenseProjection>>({
    queryKey: EXPENSES_QUERY_KEY,
    queryFn: () => expenseQueries.findAllExpenses(),
    enabled,
  });
  return {
    expenses,
    loading,
    error: error?.message ?? null,
  };
}

export function useCreateExpense() {
  const { expenseCommands } = useAppServices();
  const onSuccess = useWriteSideEffects([EXPENSES_QUERY_KEY]);
  return useMutation({
    mutationFn: (cmd: CreateExpenseCommand) => expenseCommands.createExpense(cmd),
    onSuccess,
  });
}

export function useUpdateExpense() {
  const { expenseCommands } = useAppServices();
  const onSuccess = useWriteSideEffects([EXPENSES_QUERY_KEY]);
  return useMutation({
    mutationFn: ({ id, cmd }: { id: string; cmd: UpdateExpenseCommand }) =>
      expenseCommands.updateExpense(id, cmd),
    onSuccess,
  });
}

export function useDeleteExpense() {
  const { expenseCommands } = useAppServices();
  const onSuccess = useWriteSideEffects([EXPENSES_QUERY_KEY]);
  return useMutation({
    mutationFn: (id: string) => expenseCommands.deleteExpense(id),
    onSuccess,
  });
}
