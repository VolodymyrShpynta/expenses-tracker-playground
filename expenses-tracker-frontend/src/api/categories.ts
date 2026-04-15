import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '../types/category.ts';

const BASE = '/api/categories';

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(BASE);
  return handleResponse<Category[]>(res);
}

export async function createCategory(req: CreateCategoryRequest): Promise<Category> {
  const res = await fetch(BASE, {
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
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<Category>(res);
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
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
