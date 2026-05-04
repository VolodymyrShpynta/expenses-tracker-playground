/**
 * Database provider — opens the on-device SQLite database, runs pending
 * migrations, and exposes a `LocalStore` to the rest of the app.
 *
 * The provider lives at the top of the React tree (mounted by
 * `app/_layout.tsx`) so every screen sees the same `LocalStore` instance.
 * Tests never mount this provider — they inject `InMemoryLocalStore`
 * directly.
 *
 * The bootstrap is async: until the DB is opened and migrations have run,
 * we render a centered `ActivityIndicator`. Failures surface as a banner
 * — the app is unusable without local storage, so we do not silently
 * degrade.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import * as SQLite from 'expo-sqlite';

import type { LocalStore } from '../domain/localStore.ts';
import { createSqliteLocalStore } from './sqliteLocalStore.ts';
import { migrate } from './migrations.ts';
import { DB_NAME } from './schema.ts';

interface DatabaseContextValue {
  readonly store: LocalStore;
  readonly schemaVersion: number;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export interface DatabaseProviderProps {
  readonly children: ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [value, setValue] = useState<DatabaseContextValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await SQLite.openDatabaseAsync(DB_NAME);
        const schemaVersion = await migrate(db);
        if (cancelled) return;
        setValue({ store: createSqliteLocalStore(db), schemaVersion });
      } catch (e) {
        if (cancelled) return;
        // Surface a generic message — the underlying error message may
        // contain a file path, which is fine for dev but we want one shape
        // for production. Detailed error goes to the console / Sentry.
        console.error('Failed to open local database', e);
        setError('Failed to open local database.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text variant="titleMedium">{error}</Text>
      </View>
    );
  }

  if (!value) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

/** Access the shared `LocalStore`. Throws when used outside `DatabaseProvider`. */
export function useLocalStore(): LocalStore {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useLocalStore must be used inside <DatabaseProvider>');
  }
  return ctx.store;
}
