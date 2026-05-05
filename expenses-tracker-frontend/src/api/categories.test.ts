import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithAuthMock = vi.fn();
vi.mock('./fetchWithAuth', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

const {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  resetCategories,
  restoreCategory,
  mergeCategories,
} = await import('./categories');

beforeEach(() => fetchWithAuthMock.mockReset());
afterEach(() => fetchWithAuthMock.mockReset());

function jsonRes<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('categories API client', () => {
  it('fetchCategories GETs /api/categories', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes([{ id: 'c1' }]));

    const result = await fetchCategories();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/categories');
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('createCategory POSTs JSON', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes({ id: 'c1' }));

    await createCategory({ name: 'Travel', icon: 'Flight', color: '#5b8def', sortOrder: 0 });

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Travel', icon: 'Flight', color: '#5b8def', sortOrder: 0 }),
    });
  });

  it('updateCategory PUTs JSON to /api/categories/{id}', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes({ id: 'c1' }));

    await updateCategory('c1', { name: 'Trips' });

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/categories/c1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Trips' }),
    });
  });

  it('deleteCategory DELETEs /api/categories/{id}', async () => {
    fetchWithAuthMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteCategory('c1')).resolves.toBeUndefined();
    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/categories/c1', { method: 'DELETE' });
  });

  it('resetCategories POSTs to /api/categories/reset', async () => {
    fetchWithAuthMock.mockResolvedValue(new Response(null, { status: 204 }));

    await resetCategories();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/categories/reset', { method: 'POST' });
  });

  it('restoreCategory POSTs to /api/categories/{id}/restore', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes({ id: 'c1' }));

    await restoreCategory('c1');

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/categories/c1/restore', {
      method: 'POST',
    });
  });

  it('mergeCategories POSTs to /api/categories/{source}/merge-into/{target}', async () => {
    fetchWithAuthMock.mockResolvedValue(jsonRes({ id: 'target' }));

    await mergeCategories('source', 'target');

    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/categories/source/merge-into/target',
      { method: 'POST' },
    );
  });

  it('rejects when the server returns a non-2xx response', async () => {
    fetchWithAuthMock.mockImplementation(async () => new Response('nope', { status: 400 }));

    await expect(fetchCategories()).rejects.toThrow('HTTP 400: nope');
    await expect(deleteCategory('c1')).rejects.toThrow('HTTP 400: nope');
  });
});
