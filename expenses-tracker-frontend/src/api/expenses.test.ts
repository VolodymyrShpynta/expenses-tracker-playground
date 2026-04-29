import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Replace `fetchWithAuth` so we can assert the URL/method/body without
// pulling Keycloak into tests.
const fetchWithAuthMock = vi.fn();
vi.mock('./fetchWithAuth.ts', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

const {
  fetchExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  triggerSync,
} = await import('./expenses.ts');

beforeEach(() => fetchWithAuthMock.mockReset());
afterEach(() => fetchWithAuthMock.mockReset());

function jsonRes<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('expenses API client', () => {
  it('fetchExpenses GETs /api/expenses and returns the parsed list', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes([{ id: 'a' }, { id: 'b' }]));

    const result = await fetchExpenses();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/expenses');
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('createExpense POSTs JSON to /api/expenses and returns the created row', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes({ id: 'x', amount: 100 }));

    const body = {
      description: 'Coffee',
      amount: 100,
      currency: 'USD',
      categoryId: 'cat',
      date: '2026-01-01T00:00:00Z',
    };
    const result = await createExpense(body);

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ id: 'x', amount: 100 });
  });

  it('updateExpense PUTs JSON to /api/expenses/{id}', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes({ id: 'x', amount: 250 }));

    await updateExpense('x', { amount: 250 });

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/expenses/x', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 250 }),
    });
  });

  it('deleteExpense DELETEs /api/expenses/{id} and resolves on 2xx', async () => {
    fetchWithAuthMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteExpense('x')).resolves.toBeUndefined();
    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/expenses/x', { method: 'DELETE' });
  });

  it('triggerSync POSTs to /api/expenses/sync and returns the result body', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes({ message: 'ok' }));

    const result = await triggerSync();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/expenses/sync', { method: 'POST' });
    expect(result).toEqual({ message: 'ok' });
  });

  it('rejects when the server returns a non-2xx response', async () => {
    fetchWithAuthMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(fetchExpenses()).rejects.toThrow('HTTP 500: boom');
  });
});
