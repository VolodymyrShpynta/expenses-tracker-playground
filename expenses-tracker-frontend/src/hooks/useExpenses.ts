import { useState, useEffect, useCallback } from 'react';
import { fetchExpenses } from '../api/expenses.ts';
import type { Expense } from '../types/expense.ts';

interface UseExpensesResult {
  expenses: Expense[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExpenses(): UseExpensesResult {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExpenses();
      setExpenses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { expenses, loading, error, refetch: load };
}
