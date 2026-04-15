import { useMemo } from 'react';
import { useCategories } from './useCategories.ts';
import { setBackendCategories } from '../utils/categoryConfig.ts';

/**
 * Syncs backend categories into the categoryConfig runtime cache.
 * Uses useMemo so the map is populated before children render.
 * Call this once near the app root so all components benefit.
 */
export function useSyncCategoryConfig() {
  const { categories } = useCategories();

  useMemo(() => {
    setBackendCategories(categories);
  }, [categories]);

  return { categories };
}
