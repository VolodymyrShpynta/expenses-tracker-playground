/**
 * `useAutoSync` — wires the `AutoSyncCoordinator` to React Native and
 * Expo lifecycle events while auto-sync is enabled.
 *
 * Triggers (all funnel through the coordinator's in-flight / throttle gates):
 *
 *   1. **Cold start / sign-in transition** — when `enabled` flips
 *      `false -> true`, request an immediate sync. Covers both "user
 *      just opened the app and is already signed in" and "user just
 *      signed in for the first time".
 *   2. **App foreground return** — listen on `AppState` and request a
 *      sync whenever the OS reports `inactive|background -> active`.
 *   3. **Local writes** — subscribe to `onLocalWrite()` so the
 *      coordinator can (re)schedule its debounced upload after each
 *      successful mutation.
 *   4. **App backgrounding** — flush any pending debounced sync so
 *      local edits don't sit on the device until the user returns.
 *   5. **Network reconnect** — when `@react-native-community/netinfo`
 *      reports the device transitioning offline -> online, request a
 *      sync. The package is soft-imported; if it isn't installed, this
 *      trigger silently no-ops and the other four still work.
 *
 * The `enabled` flag is the single switch — pass `false` and every
 * trigger goes silent (the manual "Sync now" button keeps working
 * because it calls `coordinator.requestSync` directly, not via this
 * hook). When `enabled` flips to false the hook also disposes any
 * pending debounce timer so a stale local-write burst doesn't fire a
 * sync after the user has just turned auto-sync off.
 *
 * This hook lives outside `src/sync/` because it imports React Native
 * APIs (`AppState`), which the sync module is required to stay free of
 * per `.github/instructions/expenses-tracker-mobile.instructions.md`.
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { AutoSyncCoordinator } from '../sync/autoSyncCoordinator';
import { onLocalWrite } from '../sync/autoSyncSignal';

export interface UseAutoSyncArgs {
  /** Null when sync is disabled / no provider configured. */
  readonly coordinator: AutoSyncCoordinator | null;
  /**
   * When false, no triggers are wired and any pending debounce timer
   * is cancelled. Typically `isSignedIn && autoSyncEnabledPreference`.
   */
  readonly enabled: boolean;
}

export function useAutoSync({ coordinator, enabled }: UseAutoSyncArgs): void {
  // ── Cancel any pending debounce timer the moment auto-sync is
  // disabled — without this, a write made just before the user toggled
  // off would still trigger a sync 15 s later.
  useEffect(() => {
    if (!coordinator) return;
    if (!enabled) coordinator.dispose();
  }, [coordinator, enabled]);

  // ── 1. Cold start / sign-in transition ──────────────────────────────
  useEffect(() => {
    if (!coordinator || !enabled) return;
    void coordinator.requestSync('cold-start');
  }, [coordinator, enabled]);

  // ── 2. AppState: foreground return + 4. backgrounding flush ────────
  useEffect(() => {
    if (!coordinator || !enabled) return;
    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      // Only fire on the active-edge: ignore active -> active spurious
      // events that some Android transitions emit.
      if (lastState !== 'active' && next === 'active') {
        void coordinator.requestSync('app-active');
      } else if (lastState === 'active' && next !== 'active') {
        void coordinator.flush('background-flush');
      }
      lastState = next;
    });
    return () => sub.remove();
  }, [coordinator, enabled]);

  // ── 3. Local-write debounce signal ──────────────────────────────────
  useEffect(() => {
    if (!coordinator || !enabled) return;
    return onLocalWrite(() => {
      coordinator.notifyLocalWrite();
    });
  }, [coordinator, enabled]);

  // ── 5. Net reconnect (soft dependency on NetInfo) ───────────────────
  useEffect(() => {
    if (!coordinator || !enabled) return;
    const unsubscribe = subscribeNetReconnect(() => {
      void coordinator.requestSync('net-reconnect');
    });
    return unsubscribe;
  }, [coordinator, enabled]);
}

/**
 * Soft-bind to `@react-native-community/netinfo`. The package is
 * declared as an optional dependency — if it isn't installed (or fails
 * to load in the current environment) we silently degrade to a no-op
 * subscription. The other four triggers above keep working.
 */
function subscribeNetReconnect(onReconnect: () => void): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let netInfo: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-community/netinfo');
    netInfo = mod?.default ?? mod;
  } catch {
    return () => {
      // No NetInfo available — fine, this trigger is optional.
    };
  }
  if (!netInfo?.addEventListener) {
    return () => {
      // NetInfo present but with an unexpected shape — degrade silently.
    };
  }

  let wasOnline: boolean | null = null;
  const handler = (state: { isConnected: boolean | null }) => {
    const online = state.isConnected === true;
    if (wasOnline === false && online) onReconnect();
    wasOnline = online;
  };
  const unsub = netInfo.addEventListener(handler);
  return typeof unsub === 'function'
    ? unsub
    : () => {
        // Some NetInfo versions return a subscription object instead of
        // an unsubscribe function. Degrade silently — we'd rather leak a
        // listener for the app's lifetime than crash on cleanup.
      };
}
