/**
 * Test store with hooks to order writers deterministically. Built on the
 * `separate` isolation test store, so transactions wait in the production
 * write queue on their own connections exactly as on a device; this
 * helper only observes and holds that queue — no timers.
 *
 * Used to reproduce a command queued behind a sync batch: the ordering in
 * which a read made before the command's transaction goes stale.
 */
import type { LocalStore } from '../domain/localStore';
import { createTestStore, type TestLocalStore } from './sqliteTestStore';

export interface QueuedLocalStore {
  readonly store: TestLocalStore;
  /**
   * Hold the write queue with an in-flight transaction, start `first`
   * and then `second` — each queueing its transaction behind the
   * previous one — then release the queue and settle both.
   */
  runQueuedInOrder<A, B>(
    first: () => Promise<A>,
    second: () => Promise<B>,
  ): Promise<readonly [A, B]>;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

export function createQueuedLocalStore(): QueuedLocalStore {
  const store = createTestStore({ isolation: 'separate' });
  const transaction = store.transaction;
  let onTransactionRequested: (() => void) | undefined;
  store.transaction = <T>(action: (tx: LocalStore) => Promise<T>): Promise<T> => {
    onTransactionRequested?.();
    onTransactionRequested = undefined;
    return transaction(action);
  };

  /** Start `operation`; resolve once it queued a transaction (or settled without one). */
  async function startQueued<T>(operation: () => Promise<T>): Promise<{ readonly settled: Promise<T> }> {
    const requested = new Promise<void>((resolve) => { onTransactionRequested = resolve; });
    const settled = operation();
    await Promise.race([requested, settled.then(() => undefined, () => undefined)]);
    return { settled };
  }

  async function runQueuedInOrder<A, B>(
    first: () => Promise<A>,
    second: () => Promise<B>,
  ): Promise<readonly [A, B]> {
    const entered = deferred();
    const release = deferred();
    const inFlight = transaction(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const a = await startQueued(first);
    const b = await startQueued(second);
    release.resolve();
    const [, resultA, resultB] = await Promise.all([inFlight, a.settled, b.settled]);
    return [resultA, resultB];
  }

  return { store, runQueuedInOrder };
}
