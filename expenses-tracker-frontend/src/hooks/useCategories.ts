import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  resetCategories,
} from '../api/categories.ts';
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '../types/category.ts';

export const CATEGORIES_QUERY_KEY = ['categories'] as const;

/**
 * Underlying TanStack Query for the full category catalog (active +
 * soft-deleted). Both [useCategories] (active-only) and
 * [useCategoryCatalog] (full catalog) read from this single cache, so the
 * network request is shared and mutations only need to invalidate one key.
 */
function useCategoriesQuery() {
  return useQuery<Category[]>({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: fetchCategories,
  });
}

/**
 * Active categories only — the default for pickers, management UI, and
 * aggregations. Backed by the same cache as [useCategoryCatalog]; soft
 * deletes are filtered client-side.
 */
export function useCategories() {
  const { data: all = [], isLoading: loading, error } = useCategoriesQuery();
  const categories = useMemo(() => all.filter((c) => !c.deleted), [all]);
  return {
    categories,
    loading,
    error: error?.message ?? null,
  };
}

/**
 * Full category catalog including soft-deleted rows. Used by
 * `useCategoryLookup` so historic expenses can resolve their original
 * display fields even after the category is archived. Pickers, the
 * management dialog, and aggregations should keep using [useCategories]
 * (active-only) instead.
 */
export function useCategoryCatalog() {
  const { data: categories = [], isLoading: loading, error } = useCategoriesQuery();
  return {
    categories,
    loading,
    error: error?.message ?? null,
  };
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateCategoryRequest) => createCategory(req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateCategoryRequest }) =>
      updateCategory(id, req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

/**
 * Factory-reset the user's category list: custom categories are
 * soft-deleted and templated rows are reset to canonical template
 * values. Historic expenses keep their `category_id` and continue to
 * resolve through the lookup against the soft-deleted row.
 */
export function useResetCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetCategories,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}
