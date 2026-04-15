import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../api/categories.ts';
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '../types/category.ts';

export const CATEGORIES_QUERY_KEY = ['categories'] as const;

export function useCategories() {
  const { data: categories = [], isLoading: loading, error } = useQuery<Category[]>({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: fetchCategories,
  });

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
