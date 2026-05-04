/**
 * Single shared TanStack Query client.
 *
 * Defaults are tuned for offline-first mobile usage:
 *   - `gcTime` is generous (5 minutes) so background-refetched data
 *     survives short navigations.
 *   - `retry` is 1 — local SQLite queries should never fail; cloud-sync
 *     calls handle their own retries inside the `SyncEngine`.
 *   - `refetchOnWindowFocus` is off because RN has no real "window focus".
 *     Use `useFocusEffect` from `expo-router` to refetch on screen focus
 *     when needed.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Canonical key for the projection list. Re-exported so call sites stay DRY. */
export const EXPENSES_QUERY_KEY = ['expenses'] as const;

/** Canonical key for the categories list. */
export const CATEGORIES_QUERY_KEY = ['categories'] as const;
