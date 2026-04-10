import type {
  Expense,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  SyncResult,
} from '../types/expense.ts';

const BASE = '/api/expenses';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchExpenses(): Promise<Expense[]> {
  const res = await fetch(BASE);
  return handleResponse<Expense[]>(res);
}

export async function fetchExpenseById(id: string): Promise<Expense> {
  const res = await fetch(`${BASE}/${id}`);
  return handleResponse<Expense>(res);
}

export async function createExpense(req: CreateExpenseRequest): Promise<Expense> {
  const res = await fetch(BASE, {
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
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<Expense>(res);
}

export async function deleteExpense(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
}

export async function triggerSync(): Promise<SyncResult> {
  const res = await fetch(`${BASE}/sync`, { method: 'POST' });
  return handleResponse<SyncResult>(res);
}
