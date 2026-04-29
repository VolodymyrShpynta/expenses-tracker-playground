import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '../types/category.ts';
import { fetchWithAuth } from './fetchWithAuth.ts';
import { expectOk, handleResponse } from './handleResponse.ts';

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
  await expectOk(res);
}

/**
 * Wipe the user's category overrides and re-seed defaults from the
 * `default_categories` template table. Templated rows revert to
 * `name = null` so the frontend renders the translated label again.
 */
export async function resetCategories(): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/reset`, { method: 'POST' });
  await expectOk(res);
}

/**
 * Resurrect a soft-deleted category. Used by the duplicate-name flow:
 * when the user tries to add a category whose name matches an archived
 * one, restoring lets historic expenses stay linked to the same row.
 */
export async function restoreCategory(id: string): Promise<Category> {
  const res = await fetchWithAuth(`${BASE}/${id}/restore`, { method: 'POST' });
  return handleResponse<Category>(res);
}

/**
 * Merge `sourceId` into `targetId`: every active expense in the source
 * category is re-categorised onto the target (one event per expense),
 * then the source is soft-deleted. Returns the (active) target.
 */
export async function mergeCategories(sourceId: string, targetId: string): Promise<Category> {
  const res = await fetchWithAuth(`${BASE}/${sourceId}/merge-into/${targetId}`, { method: 'POST' });
  return handleResponse<Category>(res);
}
