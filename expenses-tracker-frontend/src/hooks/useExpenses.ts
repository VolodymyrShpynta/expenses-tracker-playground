import { useQuery } from '@tanstack/react-query';
import { fetchExpenses } from '../api/expenses.ts';
import type { Expense } from '../types/expense.ts';

export const EXPENSES_QUERY_KEY = ['expenses'] as const;

export function useExpenses() {
  const { data: expenses = [], isLoading: loading, error } = useQuery<Expense[]>({
    queryKey: EXPENSES_QUERY_KEY,
    queryFn: fetchExpenses,
  });

  return {
    expenses,
    loading,
    error: error?.message ?? null,
  };
}
