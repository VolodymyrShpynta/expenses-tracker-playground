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
import {
  createGoogleDriveAdapter,
  isGoogleDriveConfigured,
} from '../sync/googleDriveAdapter';
import { createSyncEngine, type SyncEngine, type SyncResult } from '../sync/syncEngine';
import type { CloudDriveAdapter } from '../sync/cloudDriveAdapter';
import {
  createAutoSyncCoordinator,
  type AutoSyncCoordinator,
} from '../sync/autoSyncCoordinator';
import { CATEGORIES_QUERY_KEY, EXPENSES_QUERY_KEY } from '../queryClient';
import { useAutoSync } from './useAutoSync';

const PROVIDER_KEY = 'expenses-tracker-sync-provider';
const LAST_SYNCED_KEY = 'expenses-tracker-sync-last-synced';
const AUTO_SYNC_ENABLED_KEY = 'expenses-tracker-sync-auto-enabled';
/**
 * Per-provider cache validator persisted in AsyncStorage. Seeds the
 * engine's `cachedEtag` so the first sync after a cold start can
 * revalidate with `If-None-Match` instead of redownloading. Key per
 * provider so switching providers doesn't trash the other one's cache.
 */
const ETAG_KEY_PREFIX = 'expenses-tracker-sync-etag:';
const etagKey = (p: SyncProviderKey): string => `${ETAG_KEY_PREFIX}${p}`;

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
  /**
   * Whether automatic sync triggers (cold start, foreground, after-write
   * debounce, app-background flush, net reconnect) fire. Defaults to
   * `true`. The manual "Sync now" button still works either way.
   */
  readonly autoSyncEnabled: boolean;
  readonly setAutoSyncEnabled: (v: boolean) => Promise<void>;
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
  // Whether auto-sync triggers are enabled. Persisted, defaults to true
  // (preserves the behaviour from before the toggle existed).
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState<boolean>(true);
  // Per-provider cache validator. State (not ref) so the engine memo
  // reacts when the value changes — but writes from `onEtagChange` go
  // ONLY to `AsyncStorage`, never to this state. Reasons:
  //  - The engine's in-closure `cachedEtag` is already the live source
  //    of truth during a session, so state would just mirror it.
  //  - Setting state on every sync would rebuild the engine AND the
  //    auto-sync coordinator, resetting the coordinator's
  //    `lastAutoSyncAt` throttle and effectively bypassing the
  //    30 s minimum-interval guard.
  // The state is populated once at hydration (cold-start seed) and
  // cleared on sign-out / provider switch. AsyncStorage holds the
  // authoritative latest etag for the next cold start.
  const [etagSeeds, setEtagSeeds] = useState<Partial<Record<SyncProviderKey, string>>>({});
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
        const [storedProvider, storedLastSync, storedAutoSync, storedOneDriveEtag, storedGoogleEtag] =
          await Promise.all([
            AsyncStorage.getItem(PROVIDER_KEY),
            AsyncStorage.getItem(LAST_SYNCED_KEY),
            AsyncStorage.getItem(AUTO_SYNC_ENABLED_KEY),
            AsyncStorage.getItem(etagKey('onedrive')),
            AsyncStorage.getItem(etagKey('googledrive')),
          ]);
        if (cancelled) return;
        // Seed the etag state from storage. The engine memo runs after
        // this state update lands, so the first engine built for the
        // hydrated provider already gets the persisted seed.
        const seeds: Partial<Record<SyncProviderKey, string>> = {};
        if (storedOneDriveEtag) seeds.onedrive = storedOneDriveEtag;
        if (storedGoogleEtag) seeds.googledrive = storedGoogleEtag;
        if (Object.keys(seeds).length > 0) setEtagSeeds(seeds);
        if (storedProvider && VALID_PROVIDERS.includes(storedProvider as SyncProviderKey)) {
          setProviderState(storedProvider as SyncProviderKey);
        }
        if (storedLastSync) {
          const n = Number(storedLastSync);
          if (Number.isFinite(n) && n > 0) setLastSyncedAt(n);
        }
        // Only an explicit 'false' disables it — any other value (or
        // missing key) keeps the default-on behaviour.
        if (storedAutoSync === 'false') {
          setAutoSyncEnabledState(false);
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
        // has filled it in. Single source of truth lives in the adapter.
        return isGoogleDriveConfigured();
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
    // Capture the current provider so the persistence callback always
    // writes to the right key even if `provider` changes underneath us
    // (the engine is torn down on that transition, but in-flight
    // callbacks from before the swap should still hit the original key).
    const p = provider;
    const seed = etagSeeds[p];
    const e = createSyncEngine({
      store,
      adapter: a,
      ...(seed !== undefined ? { initialEtag: seed } : {}),
      onEtagChange: (etag) => {
        // Persist only — do NOT setEtagSeeds here. See the comment on
        // the `etagSeeds` declaration for why this is fire-and-forget.
        if (etag !== undefined) {
          void AsyncStorage.setItem(etagKey(p), etag).catch((err) => {
            console.warn('Failed to persist sync etag', err);
          });
        } else {
          void AsyncStorage.removeItem(etagKey(p)).catch((err) => {
            console.warn('Failed to clear sync etag', err);
          });
        }
      },
    });
    return { adapter: a, engine: e };
    // engineGen intentionally participates so signOut can drop the
    // engine's cached etag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, providerConfigured, store, engineGen, etagSeeds]);

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
    // Drop the cached etag for this provider — a subsequent sign-in
    // (possibly to a different account on the same provider) must not
    // reuse the previous account's validator.
    setEtagSeeds((prev) => {
      if (prev[provider] === undefined) return prev;
      const next = { ...prev };
      delete next[provider];
      return next;
    });
    void AsyncStorage.removeItem(etagKey(provider)).catch((e) => {
      console.warn('Failed to clear sync etag on sign-out', e);
    });
    // Force a fresh adapter+engine on next render so the previous
    // engine's cached etag (and any in-flight promises) are discarded.
    setEngineGen((n) => n + 1);
  }, [adapter, provider]);

  // The actual sync work — invoked by the coordinator from every trigger
  // (manual button, cold start, app foreground, after-write debounce,
  // background flush, net reconnect). Status state is identical
  // regardless of who fired the sync, so the trigger reason isn't
  // forwarded into the UI here — it's available to the coordinator for
  // logging/metrics if we add them later.
  const runSyncCycle = useCallback(async (): Promise<void> => {
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

  // Coordinator owns the in-flight guard, min-interval throttle, and
  // after-write debounce shared by every trigger source.
  const coordinator = useMemo<AutoSyncCoordinator | null>(() => {
    if (!engine) return null;
    return createAutoSyncCoordinator(runSyncCycle);
  }, [engine, runSyncCycle]);

  // Dispose timers when the coordinator is replaced (sign-out, provider
  // change) or the provider unmounts.
  useEffect(() => {
    if (!coordinator) return;
    return () => coordinator.dispose();
  }, [coordinator]);

  // Wire AppState / NetInfo / local-write triggers to the coordinator.
  // `enabled` gates every auto trigger — when the user has switched
  // off auto-sync in settings, only the manual "Sync now" button
  // (via `syncNow` below) drives `coordinator.requestSync`.
  useAutoSync({ coordinator, enabled: isSignedIn && autoSyncEnabled });

  const setAutoSyncEnabled = useCallback(async (v: boolean) => {
    setAutoSyncEnabledState(v);
    try {
      await AsyncStorage.setItem(AUTO_SYNC_ENABLED_KEY, v ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to save auto-sync preference', e);
    }
  }, []);

  const syncNow = useCallback(async () => {
    // Manual button bypasses the auto-sync min-interval throttle but
    // still respects the in-flight guard — see `AutoSyncCoordinator`.
    await coordinator?.requestSync('manual', { force: true });
  }, [coordinator]);

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
      autoSyncEnabled,
      setAutoSyncEnabled,
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
      autoSyncEnabled,
      setAutoSyncEnabled,
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
