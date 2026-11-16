/**
 * Shared `onSuccess` handler for mutations that write to the local store.
 *
 * Every local write has to do two things in lock-step: refresh the affected
 * query caches so the UI re-reads the new state, and notify the auto-sync
 * coordinator so the change is pushed to the cloud drive (debounced — see
 * `AutoSyncCoordinator`). Funnelling both through one hook means a write hook
 * can't refresh caches without also scheduling a sync, or vice versa — except
 * for a command that wrote nothing, where there is nothing to push.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

import { notifyLocalWrite } from '../sync/autoSyncSignal';

/**
 * @param queryKeys the caches to invalidate once the write commits.
 * @returns an `onSuccess` callback for `useMutation`. Caches are always
 *   refreshed; the sync is skipped when the command resolved `false` /
 *   `undefined` / `null`, which local commands only do when they wrote
 *   nothing (e.g. deleting a row a sync had already deleted).
 */
export function useWriteSideEffects(
  queryKeys: ReadonlyArray<QueryKey>,
): (result: unknown) => void {
  const queryClient = useQueryClient();
  return (result) => {
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ queryKey });
    }
    if (result === false || result == null) return;
    notifyLocalWrite();
  };
}
