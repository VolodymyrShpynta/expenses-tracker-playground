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
 *   5. **Network reconnect** — listen on `@react-native-community/netinfo`
 *      and request a sync whenever the device transitions offline →
 *      online. Covers the gap the other four triggers miss: app stays
 *      foregrounded throughout a connectivity outage (train tunnel,
 *      elevator, …) and regains the network without any user action.
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
import NetInfo from '@react-native-community/netinfo';

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

  // ── 5. Net reconnect ────────────────────────────────────────────────
  useEffect(() => {
    if (!coordinator || !enabled) return;
    const unsubscribe = subscribeNetReconnect(() => {
      void coordinator.requestSync('net-reconnect');
    });
    return unsubscribe;
  }, [coordinator, enabled]);
}

/**
 * Subscribe to `@react-native-community/netinfo` and fire `onReconnect`
 * on every offline → online edge. The first connectivity event after
 * mount establishes the baseline and does not fire — we only want
 * **transitions**, not the initial state.
 */
function subscribeNetReconnect(onReconnect: () => void): () => void {
  let wasOnline: boolean | null = null;
  return NetInfo.addEventListener((state) => {
    const online = state.isConnected === true;
    if (wasOnline === false && online) onReconnect();
    wasOnline = online;
  });
}
