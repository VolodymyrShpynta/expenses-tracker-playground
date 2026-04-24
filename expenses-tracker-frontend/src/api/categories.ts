import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '../types/category.ts';
import { fetchWithAuth } from './fetchWithAuth.ts';

const BASE = '/api/categories';

/**
 * Fetch the user's full category catalog (active + soft-deleted rows).
 * Soft-deleted rows are needed by `useCategoryLookup` so historic
 * expenses keep resolving their original name/icon/color after the
 * category is archived. Active-only consumers filter `deleted = false`
 * client-side via `useCategories()`.
 */
export async function fetchCategories(): Promise<Category[]> {
  const res = await fetchWithAuth(BASE);
  return handleResponse<Category[]>(res);
}

export async function createCategory(req: CreateCategoryRequest): Promise<Category> {
  const res = await fetchWithAuth(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<Category>(res);
}

export async function updateCategory(
  id: string,
  req: UpdateCategoryRequest,
): Promise<Category> {
  const res = await fetchWithAuth(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<Category>(res);
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
}

/**
 * Wipe the user's category overrides and re-seed defaults from the
 * `default_categories` template table. Templated rows revert to
 * `name = null` so the frontend renders the translated label again.
 */
export async function resetCategories(): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/reset`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}
