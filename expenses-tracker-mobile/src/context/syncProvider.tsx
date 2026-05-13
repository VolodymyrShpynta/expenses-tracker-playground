/**
 * Cloud-sync context — owns the live `SyncEngine` plus its
 * `CloudDriveAdapter` for the currently selected provider, persists the
 * provider preference, and exposes the sign-in / sign-out / sync
 * actions consumed by the settings UI.
 *
 * Composition order: must sit inside `QueryClientProvider` (we invalidate
 * keys after a successful sync) and `AppServicesProvider` (we read
 * `useLocalStore`).
 *
 * Adapter / engine recreation: keyed on `(provider, engineGen)`.
 * Calling `signOut()` bumps `engineGen` so the engine's in-closure
 * `cachedEtag` is dropped and the next sync starts from a fresh download.
 *
 * The adapter classes themselves live in `src/sync/`; this provider only
 * wires them together. Provider-specific HTTP/OAuth logic stays out of
 * the React tree.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';

import { useLocalStore } from '../db/databaseProvider';
import { createOneDriveAdapter } from '../sync/oneDriveAdapter';
import { createGoogleDriveAdapter } from '../sync/googleDriveAdapter';
import { createSyncEngine, type SyncEngine, type SyncResult } from '../sync/syncEngine';
import type { CloudDriveAdapter } from '../sync/cloudDriveAdapter';
import { CATEGORIES_QUERY_KEY, EXPENSES_QUERY_KEY } from '../queryClient';

const PROVIDER_KEY = 'expenses-tracker-sync-provider';
const LAST_SYNCED_KEY = 'expenses-tracker-sync-last-synced';

/** Sentinel for the unconfigured Google client id. */
const GOOGLE_PLACEHOLDER = 'TODO_REPLACE_WITH_GOOGLE_CLIENT_ID';

export type SyncProviderKey = 'none' | 'onedrive' | 'googledrive';

const VALID_PROVIDERS: ReadonlyArray<SyncProviderKey> = ['none', 'onedrive', 'googledrive'];

export interface SyncContextValue {
  readonly provider: SyncProviderKey;
  /** Whether the selected provider has usable credentials baked in. */
  readonly providerConfigured: boolean;
  readonly setProvider: (p: SyncProviderKey) => Promise<void>;
  readonly isSignedIn: boolean;
  readonly signingIn: boolean;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly syncing: boolean;
  readonly syncNow: () => Promise<void>;
  readonly lastSyncedAt: number | null;
  readonly lastResult: SyncResult | null;
  readonly lastError: string | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export interface SyncProviderProps {
  readonly children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const store = useLocalStore();
  const queryClient = useQueryClient();

  const [provider, setProviderState] = useState<SyncProviderKey>('none');
  // `signedIn` is the adapter-reported state. When there is no adapter
  // (provider = 'none' or unconfigured), `isSignedIn` below derives to
  // `false` without needing a synchronous setState in the refresh
  // effect — see `react-hooks/no-cascading-state-updates`.
  const [signedIn, setSignedIn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  // Bumping this forces useMemo below to rebuild the adapter+engine,
  // dropping the engine's in-closure cachedEtag. Used after sign-out so
  // a subsequent sign-in starts from a clean slate.
  const [engineGen, setEngineGen] = useState(0);

  // Hydrate persisted preference + lastSyncedAt. Defaults are valid, so
  // we don't gate the UI on this.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedProvider, storedLastSync] = await Promise.all([
          AsyncStorage.getItem(PROVIDER_KEY),
          AsyncStorage.getItem(LAST_SYNCED_KEY),
        ]);
        if (cancelled) return;
        if (storedProvider && VALID_PROVIDERS.includes(storedProvider as SyncProviderKey)) {
          setProviderState(storedProvider as SyncProviderKey);
        }
        if (storedLastSync) {
          const n = Number(storedLastSync);
          if (Number.isFinite(n) && n > 0) setLastSyncedAt(n);
        }
      } catch (e) {
        console.warn('Failed to hydrate sync preferences', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerConfigured = useMemo<boolean>(() => {
    switch (provider) {
      case 'none':
        return true;
      case 'onedrive':
        return true;
      case 'googledrive':
        // The default client ID in googleDriveAdapter.ts is a TODO
        // placeholder. Refuse to construct the adapter until the user
        // has filled it in.
        return !GOOGLE_PLACEHOLDER.startsWith('TODO_REPLACE');
    }
  }, [provider]);

  // Adapter + engine — rebuilt whenever the user switches providers or
  // engineGen is bumped (post-signOut).
  const { adapter, engine } = useMemo<{
    adapter: CloudDriveAdapter | null;
    engine: SyncEngine | null;
  }>(() => {
    if (provider === 'none' || !providerConfigured) {
      return { adapter: null, engine: null };
    }
    const a: CloudDriveAdapter =
      provider === 'onedrive' ? createOneDriveAdapter() : createGoogleDriveAdapter();
    const e = createSyncEngine({ store, adapter: a });
    return { adapter: a, engine: e };
    // engineGen intentionally participates so signOut can drop the
    // engine's cached etag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, providerConfigured, store, engineGen]);

  // Refresh `signedIn` whenever the adapter changes.
  // Use a ref so we don't race two parallel refreshes when adapter
  // identity flips mid-effect. When `adapter` is null we don't touch
  // state — the derived `isSignedIn` below already evaluates to false.
  const refreshSignedInRef = useRef(0);
  useEffect(() => {
    if (!adapter) return;
    const ticket = ++refreshSignedInRef.current;
    void adapter.isSignedIn().then((v) => {
      if (ticket !== refreshSignedInRef.current) return;
      setSignedIn(v);
    }).catch((e) => {
      console.warn('Failed to read isSignedIn', e);
      if (ticket !== refreshSignedInRef.current) return;
      setSignedIn(false);
    });
  }, [adapter]);

  // Surface `false` whenever the adapter is gone, regardless of
  // whatever the last adapter reported before it was torn down.
  const isSignedIn = adapter ? signedIn : false;

  const setProvider = useCallback(
    async (p: SyncProviderKey) => {
      setProviderState(p);
      setLastError(null);
      setLastResult(null);
      try {
        await AsyncStorage.setItem(PROVIDER_KEY, p);
      } catch (e) {
        console.warn('Failed to save sync provider', e);
      }
    },
    [],
  );

  const signIn = useCallback(async () => {
    if (!adapter) return;
    setLastError(null);
    setSigningIn(true);
    try {
      await adapter.signIn();
      setSignedIn(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
      setSignedIn(false);
      // Re-throw so the caller can surface a toast/snackbar if desired.
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [adapter]);

  const signOut = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.signOut();
    } catch (e) {
      console.warn('Sign-out reported an error (ignored)', e);
    }
    setSignedIn(false);
    setLastResult(null);
    setLastError(null);
    // Force a fresh adapter+engine on next render so the previous
    // engine's cached etag (and any in-flight promises) are discarded.
    setEngineGen((n) => n + 1);
  }, [adapter]);

  const syncNow = useCallback(async () => {
    if (!engine) return;
    setLastError(null);
    setSyncing(true);
    try {
      const result = await engine.performFullSync();
      setLastResult(result);
      const now = Date.now();
      setLastSyncedAt(now);
      try {
        await AsyncStorage.setItem(LAST_SYNCED_KEY, String(now));
      } catch (e) {
        console.warn('Failed to save lastSyncedAt', e);
      }
      // Local projections / categories may have changed — refresh the UI.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
    } finally {
      setSyncing(false);
    }
  }, [engine, queryClient]);

  const value = useMemo<SyncContextValue>(
    () => ({
      provider,
      providerConfigured,
      setProvider,
      isSignedIn,
      signingIn,
      signIn,
      signOut,
      syncing,
      syncNow,
      lastSyncedAt,
      lastResult,
      lastError,
    }),
    [
      provider,
      providerConfigured,
      setProvider,
      isSignedIn,
      signingIn,
      signIn,
      signOut,
      syncing,
      syncNow,
      lastSyncedAt,
      lastResult,
      lastError,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used inside <SyncProvider>');
  }
  return ctx;
}
