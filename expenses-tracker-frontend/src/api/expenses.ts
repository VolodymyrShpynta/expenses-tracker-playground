import type {
  Expense,
  CreateExpenseRequest,
  UpdateExpenseRequest,
} from '../types/expense.ts';
import { fetchWithAuth } from './fetchWithAuth.ts';
import { expectOk, handleResponse } from './handleResponse.ts';

const BASE = '/api/expenses';

export async function fetchExpenses(): Promise<Expense[]> {
  const res = await fetchWithAuth(BASE);
  return handleResponse<Expense[]>(res);
}

export async function createExpense(req: CreateExpenseRequest): Promise<Expense> {
  const res = await fetchWithAuth(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<Expense>(res);
}

export async function updateExpense(
  id: string,
  req: UpdateExpenseRequest,
): Promise<Expense> {
  const res = await fetchWithAuth(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<Expense>(res);
}

export async function deleteExpense(id: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/${id}`, { method: 'DELETE' });
  await expectOk(res);
}
