import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createExpense,
  updateExpense,
  deleteExpense,
} from '../api/expenses.ts';
import type { CreateExpenseRequest, UpdateExpenseRequest } from '../types/expense.ts';
import { EXPENSES_QUERY_KEY } from './useExpenses.ts';

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateExpenseRequest) => createExpense(req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY }),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateExpenseRequest }) =>
      updateExpense(id, req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY }),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY }),
  });
}

