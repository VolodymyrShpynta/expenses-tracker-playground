/**
 * Application context — wires the per-user domain services on top of
 * `LocalStore` and the persisted `userId`.
 *
 * Composed in `app/_layout.tsx` after `DatabaseProvider`. Screens consume
 * services through TanStack Query hooks (`src/hooks/`), never directly.
 *
 * On first launch this provider also seeds the default category templates
 * — analogue of the backend's `R__Seed_default_categories.sql` migration.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import * as Crypto from 'expo-crypto';

import { useLocalStore } from '../db/databaseProvider';
import {
  createExpenseCommandService,
  type ExpenseCommandService,
  type IdGenerator,
} from '../domain/commands';
import {
  createExpenseQueryService,
  type ExpenseQueryService,
} from '../domain/queries';
import {
  createCategoryService,
  type CategoryService,
} from '../domain/categoryService';
import { systemTime } from '../utils/time';
import { getOrCreateUserId } from '../utils/userId';

interface AppServicesContextValue {
  readonly userId: string;
  readonly expenseCommands: ExpenseCommandService;
  readonly expenseQueries: ExpenseQueryService;
  readonly categories: CategoryService;
}

const AppServicesContext = createContext<AppServicesContextValue | null>(null);

const idGenerator: IdGenerator = {
  newUuid: () => Crypto.randomUUID(),
};

export interface AppServicesProviderProps {
  readonly children: ReactNode;
}

export function AppServicesProvider({ children }: AppServicesProviderProps) {
  const store = useLocalStore();
  const [value, setValue] = useState<AppServicesContextValue | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await getOrCreateUserId();
      const expenseCommands = createExpenseCommandService({
        store,
        time: systemTime,
        ids: idGenerator,
        userId,
      });
      const expenseQueries = createExpenseQueryService({ store, userId });
      const categories = createCategoryService({
        store,
        time: systemTime,
        ids: idGenerator,
        userId,
      });
      // Seed default templates on first launch — idempotent.
      await categories.seedDefaultsIfEmpty();
      if (cancelled) return;
      setValue({ userId, expenseCommands, expenseQueries, categories });
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (!value) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  return <AppServicesContext.Provider value={value}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServicesContextValue {
  const ctx = useContext(AppServicesContext);
  if (!ctx) {
    throw new Error('useAppServices must be used inside <AppServicesProvider>');
  }
  return ctx;
}

export function useUserId(): string {
  return useAppServices().userId;
}
