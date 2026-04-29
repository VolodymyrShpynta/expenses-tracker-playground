import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderHook, type RenderHookResult } from '@testing-library/react';

/**
 * Spin up a fresh, retry-disabled QueryClient and render a hook that uses
 * TanStack Query inside the provider. Each invocation is fully isolated so
 * tests can run in parallel without leaking cached queries.
 */
export function renderHookWithQuery<TProps, TResult>(
  callback: (props: TProps) => TResult,
  initialProps?: TProps,
): RenderHookResult<TResult, TProps> & { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const result = renderHook(callback, { wrapper, initialProps });
  return Object.assign(result, { client });
}
