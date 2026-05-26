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

import type { LocalStore } from '../domain/localStore';
import { createSqliteLocalStore } from './sqliteLocalStore';
import { createExchangeRateStore } from './exchangeRateStore';
import type { ExchangeRateStore } from './exchangeRateStore';
import { migrate } from './migrations';
import { DB_NAME } from './schema';

interface DatabaseContextValue {
  readonly store: LocalStore;
  readonly exchangeRateStore: ExchangeRateStore;
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
        await configureConnection(db);
        const schemaVersion = await migrate(db);
        if (cancelled) return;
        setValue({
          store: createSqliteLocalStore(db),
          exchangeRateStore: createExchangeRateStore(db),
          schemaVersion,
        });
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

/**
 * One-time per-connection setup. Runs BEFORE `migrate` so the PRAGMAs are
 * in effect for the migration transactions too.
 *
 * - `journal_mode = WAL` lets readers and writers run concurrently. Without
 *   it (default DELETE mode) a long-running sync transaction blocks every
 *   read query the UI tries to issue.
 * - `synchronous = NORMAL` is the SQLite-recommended pairing with WAL —
 *   commits no longer fsync the WAL file. Crash durability drops from
 *   "every commit is durable" to "every checkpoint is durable", which is
 *   fine for an event-sourced store: the cloud sync file is the source of
 *   truth across devices, and a lost local commit is recoverable.
 *
 * Both PRAGMAs are per-connection and persist across app launches when set
 * once on the database file (WAL mode is sticky in the SQLite file
 * header). Re-running them on every open is cheap and explicit.
 */
async function configureConnection(db: SQLite.SQLiteDatabase): Promise<void> {
  // PRAGMA journal_mode = WAL cannot be issued inside a transaction —
  // expo-sqlite's openDatabaseAsync hands us a clean connection so this
  // is safe here.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
}

/** Access the shared `LocalStore`. Throws when used outside `DatabaseProvider`. */
export function useLocalStore(): LocalStore {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useLocalStore must be used inside <DatabaseProvider>');
  }
  return ctx.store;
}

/**
 * Access the shared exchange-rate cache. Throws when used outside
 * `DatabaseProvider`. Backed by the `exchange_rates` SQLite table (see
 * `schema.ts` migration v2).
 */
export function useExchangeRateStore(): ExchangeRateStore {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useExchangeRateStore must be used inside <DatabaseProvider>');
  }
  return ctx.exchangeRateStore;
}
