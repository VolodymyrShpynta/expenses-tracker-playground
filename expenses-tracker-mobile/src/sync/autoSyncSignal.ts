/**
 * Module-level pub/sub for "local write happened" notifications.
 *
 * Mutation hooks (`useCreateExpense`, `useUpdateCategory`, …) call
 * `notifyLocalWrite()` from their `onSuccess` callback. The auto-sync
 * coordinator subscribes via `onLocalWrite()` and reschedules its
 * debounced upload timer.
 *
 * Going through a module-level singleton keeps mutation hooks decoupled
 * from the `SyncContext` shape — hooks don't need to know whether sync
 * is configured, signed in, or enabled. The sync layer subscribes when
 * it wants notifications and unsubscribes when it doesn't.
 *
 * Tests can call `clearLocalWriteListenersForTest()` to reset state
 * between cases.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyLocalWrite(): void {
  // Iterate over a snapshot so listeners that unsubscribe mid-iteration
  // don't trip the Set iterator.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (e) {
      // Listeners must not break the notification fanout. Auto-sync
      // failures are surfaced elsewhere (SyncContext `lastError`).
      console.warn('Local-write listener threw', e);
    }
  }
}

/** Subscribe. Returns an unsubscribe function. */
export function onLocalWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — clears the listener set between vitest cases. */
export function clearLocalWriteListenersForTest(): void {
  listeners.clear();
}
