/**
 * Background-fetch sync task.
 *
 * Registers an `expo-background-fetch` task that runs roughly every
 * 15 minutes (iOS) or whenever the OS schedules it (Android). The task
 * runs the same `SyncEngine.performFullSync()` as the foreground UI —
 * one code path, two triggers.
 *
 * Lifecycle:
 *   - `defineSyncTask()` is called at module import time
 *     (side-effectful, mirrors the way `expo-task-manager` examples are
 *     written). The task is named once and never re-registered.
 *   - `registerSyncTask()` enables it (typically called from settings UI
 *     after the user signs into a cloud provider and toggles "Sync in
 *     background"). Idempotent.
 *   - `unregisterSyncTask()` disables it.
 *
 * The task itself is a thin shim that delegates to a caller-provided
 * factory so tests / future feature flags can swap implementations
 * without touching this file.
 *
 * NOT covered by Vitest — exercising this requires the OS scheduler.
 * Validate via Expo dev client + logs.
 */
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import type { SyncEngine } from './syncEngine.ts';

export const SYNC_TASK_NAME = 'expenses-tracker.sync.background';

/**
 * Resolver returning the active `SyncEngine`, or `null` when the user is
 * not signed in or sync is disabled. Returning `null` short-circuits the
 * task and reports `NoData` to the OS.
 */
export type SyncEngineResolver = () => Promise<SyncEngine | null>;

let resolver: SyncEngineResolver | null = null;

/**
 * Define the task. Call once at app start (e.g. from `app/_layout.tsx`)
 * with a function that resolves the active SyncEngine on demand.
 */
export function defineSyncTask(getEngine: SyncEngineResolver): void {
  resolver = getEngine;

  if (TaskManager.isTaskDefined(SYNC_TASK_NAME)) return;

  TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    const engine = resolver ? await resolver() : null;
    if (!engine) return BackgroundFetch.BackgroundFetchResult.NoData;

    try {
      const result = await engine.performFullSync();
      const changed =
        result.uploadedLocal > 0 || result.remote.applied > 0;
      return changed
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/** Register the task with the OS scheduler. Safe to call repeatedly. */
export async function registerSyncTask(): Promise<void> {
  await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
    minimumInterval: 15 * 60, // seconds — OS may extend it.
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

/** Unregister the task. Use when the user signs out / disables sync. */
export async function unregisterSyncTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME)) {
    await BackgroundFetch.unregisterTaskAsync(SYNC_TASK_NAME);
  }
}
