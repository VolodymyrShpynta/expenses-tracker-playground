/**
 * TanStack Query wrappers over `CategoryService`. Splits "active" vs
 * "all" the same way the web frontend does — `useCategories` for pickers
 * and management UI; `useCategoryCatalog` for `useCategoryLookup` so
 * historic expenses keep their display fields after archival.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CATEGORIES_QUERY_KEY, EXPENSES_QUERY_KEY } from '../queryClient';
import { useAppServices } from '../context/appServicesProvider';
import type {
  CreateCategoryCommand,
  UpdateCategoryCommand,
} from '../domain/categoryService';
import type { Category } from '../domain/types';

function useCategoriesQuery() {
  const { categories } = useAppServices();
  return useQuery<ReadonlyArray<Category>>({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => categories.findAllCategories(),
  });
}

/** Active categories only — for pickers, lists, and aggregations. */
export function useCategories() {
  const { data: all = [], isLoading: loading, error } = useCategoriesQuery();
  const categories = useMemo(() => all.filter((c) => !c.deleted), [all]);
  return {
    categories,
    loading,
    error: error?.message ?? null,
  };
}

/** Full catalog (active + soft-deleted). Used by `useCategoryLookup`. */
export function useCategoryCatalog() {
  const { data: categories = [], isLoading: loading, error } = useCategoriesQuery();
  return {
    categories,
    loading,
    error: error?.message ?? null,
  };
}

export function useCreateCategory() {
  const { categories } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cmd: CreateCategoryCommand) => categories.createCategory(cmd),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useUpdateCategory() {
  const { categories } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cmd }: { id: string; cmd: UpdateCategoryCommand }) =>
      categories.updateCategory(id, cmd),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useDeleteCategory() {
  const { categories } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categories.deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useRestoreCategory() {
  const { categories } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categories.restoreCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}

export function useMergeCategories() {
  const { categories, expenseQueries, expenseCommands } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      categories.mergeCategories(sourceId, targetId, expenseQueries, expenseCommands),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
    },
  });
}

export function useResetCategoriesToDefaults() {
  const { categories } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => categories.resetToDefaults(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
  });
}
