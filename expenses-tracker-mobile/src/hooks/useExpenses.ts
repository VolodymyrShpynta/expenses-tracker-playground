/**
 * TanStack Query wrappers over `ExpenseQueryService` / `ExpenseCommandService`.
 *
 * Components must consume these hooks rather than calling the domain
 * services directly — same separation the web frontend enforces.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EXPENSES_QUERY_KEY } from '../queryClient';
import { useAppServices } from '../context/appServicesProvider';
import { notifyLocalWrite } from '../sync/autoSyncSignal';
import type {
  CreateExpenseCommand,
  UpdateExpenseCommand,
} from '../domain/commands';
import type { ExpenseProjection } from '../domain/types';

export function useExpenses() {
  const { expenseQueries } = useAppServices();
  const { data: expenses = [], isLoading: loading, error } = useQuery<ReadonlyArray<ExpenseProjection>>({
    queryKey: EXPENSES_QUERY_KEY,
    queryFn: () => expenseQueries.findAllExpenses(),
  });
  return {
    expenses,
    loading,
    error: error?.message ?? null,
  };
}

export function useCreateExpense() {
  const { expenseCommands } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cmd: CreateExpenseCommand) => expenseCommands.createExpense(cmd),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
      // Schedule a debounced cloud sync — see AutoSyncCoordinator.
      notifyLocalWrite();
    },
  });
}

export function useUpdateExpense() {
  const { expenseCommands } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cmd }: { id: string; cmd: UpdateExpenseCommand }) =>
      expenseCommands.updateExpense(id, cmd),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
      notifyLocalWrite();
    },
  });
}

export function useDeleteExpense() {
  const { expenseCommands } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseCommands.deleteExpense(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
      notifyLocalWrite();
    },
  });
}
