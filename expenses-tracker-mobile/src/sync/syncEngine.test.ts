/**
 * SyncEngine orchestration tests — verifies the full
 * download → apply → upload cycle against an in-memory adapter.
 *
 * These mirror the scenarios in the backend's `ExpenseEventSyncServiceTest`:
 *   - First sync from a fresh account (no remote file) uploads local events.
 *   - Subsequent sync with a stale etag downloads + applies remote events.
 *   - Etag-cached cycle skips remote-apply and only uploads new local events.
 *   - Optimistic-concurrency conflict triggers a retry.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSyncEngine } from './syncEngine';
import { encodeSyncFile } from './codec';
import { ConcurrencyError } from './cloudDriveAdapter';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { InMemoryCloudDriveAdapter } from '../test/inMemoryCloudDriveAdapter';
import type {
  CategoryEvent,
  CategoryEventEntry,
  EventEntry,
  ExpenseEvent,
} from '../domain/types';

const makeLocalEvent = (
  eventId: string,
  expenseId: string,
  timestamp: number,
): ExpenseEvent => ({
  eventId,
  timestamp,
  eventType: 'CREATED',
  expenseId,
  payload: JSON.stringify({
    id: expenseId,
    amount: 1234,
    currency: 'USD',
    updatedAt: timestamp,
    deleted: false,
  }),
  committed: false,
});

const makeRemoteEvent = (
  eventId: string,
  expenseId: string,
  timestamp: number,
  amount = 9999,
): EventEntry => ({
  eventId,
  timestamp,
  eventType: 'CREATED',
  expenseId,
  payload: {
    id: expenseId,
    amount,
    currency: 'EUR',
    updatedAt: timestamp,
    deleted: false,
  },
});

const makeLocalCategoryEvent = (
  eventId: string,
  categoryId: string,
  timestamp: number,
): CategoryEvent => ({
  eventId,
  timestamp,
  eventType: 'CREATED',
  categoryId,
  payload: JSON.stringify({
    id: categoryId,
    name: 'Food',
    icon: 'food',
    color: '#FF0000',
    sortOrder: 0,
    updatedAt: timestamp,
    deleted: false,
  }),
  committed: false,
});

const makeRemoteCategoryEvent = (
  eventId: string,
  categoryId: string,
  timestamp: number,
): CategoryEventEntry => ({
  eventId,
  timestamp,
  eventType: 'CREATED',
  categoryId,
  payload: {
    id: categoryId,
    name: 'Travel',
    icon: 'plane',
    color: '#00AAFF',
    sortOrder: 1,
    updatedAt: timestamp,
    deleted: false,
  },
});

describe('SyncEngine.performFullSync', () => {
  let store: InMemoryLocalStore;
  let adapter: InMemoryCloudDriveAdapter;
  let engine: ReturnType<typeof createSyncEngine>;

  beforeEach(() => {
    store = new InMemoryLocalStore();
    adapter = new InMemoryCloudDriveAdapter();
    engine = createSyncEngine({
      store,
      adapter,
      compressed: true,
    });
  });

  it('uploads local events when the remote file does not exist', async () => {
    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));

    const result = await engine.performFullSync();

    expect(result.uploadedLocal).toBe(1);
    expect(result.downloadedRemote).toBe(false);
    expect(result.remote.applied).toBe(0);
    expect(adapter.uploadCount).toBe(1);

    // Local event is now committed.
    expect(await store.findUncommittedEvents()).toHaveLength(0);
  });

  it('downloads + applies remote events on first cycle', async () => {
    // Seed the remote file with one event and a known etag.
    const remoteEvent = makeRemoteEvent('r1', 'rx1', 50);
    adapter.setRemoteBytes(encodeSyncFile({ events: [remoteEvent], categoryEvents: [] }, true));

    const result = await engine.performFullSync();

    expect(result.downloadedRemote).toBe(true);
    expect(result.remote.applied).toBe(1);
    expect(result.uploadedLocal).toBe(0);
    // No upload because there were no local events to push.
    expect(adapter.uploadCount).toBe(0);
    expect(await store.findProjectionById('rx1')).toBeDefined();
  });

  it('round-trips: download remote, apply, push local in one cycle', async () => {
    adapter.setRemoteBytes(encodeSyncFile({ events: [makeRemoteEvent('r1', 'rx1', 50)], categoryEvents: [] }, true));
    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));

    const result = await engine.performFullSync();

    expect(result.remote.applied).toBe(1);
    expect(result.uploadedLocal).toBe(1);
    expect(adapter.uploadCount).toBe(1);
  });

  it('skips remote-apply on second sync when etag is unchanged', async () => {
    adapter.setRemoteBytes(encodeSyncFile({ events: [makeRemoteEvent('r1', 'rx1', 50)], categoryEvents: [] }, true));

    // First sync: applies remote.
    const first = await engine.performFullSync();
    expect(first.downloadedRemote).toBe(true);
    expect(first.remote.applied).toBe(1);
    expect(adapter.notModifiedCount).toBe(0);

    // No local changes, no remote changes — second cycle short-circuits
    // via `If-None-Match`. The adapter must report it as a not-modified
    // response (no body transferred).
    const second = await engine.performFullSync();
    expect(second.downloadedRemote).toBe(false);
    expect(second.remote.applied).toBe(0);
    expect(second.uploadedLocal).toBe(0);
    expect(adapter.notModifiedCount).toBe(1);
  });

  it('uses If-None-Match on idle cycles to save bandwidth', async () => {
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [] }, true));

    // Prime the engine's cachedEtag.
    await engine.performFullSync();
    const baselineNotModified = adapter.notModifiedCount;

    // Three idle cycles — none should re-download the body.
    await engine.performFullSync();
    await engine.performFullSync();
    await engine.performFullSync();
    expect(adapter.notModifiedCount).toBe(baselineNotModified + 3);
  });

  it('skips If-None-Match when local writes are pending (needs bytes to merge)', async () => {
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [] }, true));
    await engine.performFullSync(); // prime cachedEtag

    // A pending local write means we MUST fetch the full file to merge
    // and upload. The engine should not use `If-None-Match` here.
    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));
    const before = adapter.notModifiedCount;
    const result = await engine.performFullSync();
    expect(result.uploadedLocal).toBe(1);
    expect(adapter.notModifiedCount).toBe(before);
  });

  // ----- Persisted etag (cold-start hydration) ----------------------------
  //
  // The engine receives an `initialEtag` from its caller (SyncProvider
  // reads it from AsyncStorage) and reports updates via `onEtagChange`.
  // These tests assert the contract, not the storage layer.

  it('seeds cachedEtag from initialEtag so cold starts revalidate without redownloading', async () => {
    // Remote already exists at a known etag (simulates "another device
    // wrote yesterday; today we cold-start the app").
    const knownEtag = adapter.setRemoteBytes(
      encodeSyncFile({ events: [], categoryEvents: [] }, true),
    );

    // Build a fresh engine pre-seeded with that etag.
    const seededEngine = createSyncEngine({
      store,
      adapter,
      compressed: true,
      initialEtag: knownEtag,
    });

    const before = adapter.notModifiedCount;
    const result = await seededEngine.performFullSync();

    // First cycle hit 'not-modified' instead of re-downloading the body.
    expect(adapter.notModifiedCount).toBe(before + 1);
    expect(result.downloadedRemote).toBe(false);
    expect(result.remote.applied).toBe(0);
  });

  it('reports the new etag via onEtagChange after a successful upload', async () => {
    const seen: Array<string | undefined> = [];
    const observedEngine = createSyncEngine({
      store,
      adapter,
      compressed: true,
      onEtagChange: (etag) => seen.push(etag),
    });

    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));
    await observedEngine.performFullSync();

    // The final reported value matches what the adapter holds — that's
    // what callers persist for the next cold start.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(adapter.peekEtag());
  });

  it('reports undefined via onEtagChange on concurrency retry (clears stale persisted etag)', async () => {
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [] }, true));
    const seen: Array<string | undefined> = [];
    const observedEngine = createSyncEngine({
      store,
      adapter,
      compressed: true,
      onEtagChange: (etag) => seen.push(etag),
    });
    // Prime the engine so it has a real cachedEtag (and thus a
    // persisted value on the caller side) for the conflict to invalidate.
    await observedEngine.performFullSync();
    expect(seen.length).toBeGreaterThan(0);
    seen.length = 0;

    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));

    // Force a concurrency conflict on the first upload, succeed on the
    // retry. The engine's invalidation must be observable to the
    // persistence callback so callers can drop their stale copy.
    const realUpload = adapter.upload.bind(adapter);
    let firstUpload = true;
    adapter.upload = async (bytes, ifMatch) => {
      if (firstUpload) {
        firstUpload = false;
        adapter.setRemoteBytes(
          encodeSyncFile({ events: [], categoryEvents: [] }, true),
        );
        throw new ConcurrencyError('etag moved');
      }
      return realUpload(bytes, ifMatch);
    };

    await observedEngine.performFullSync();
    // At least once during the cycle the engine declared the cache stale.
    expect(seen).toContain(undefined);
  });

  it('retries the cycle on optimistic-concurrency conflict', async () => {
    // Adapter starts with a remote file at etag-1.
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [] }, true));
    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));

    // Override `download` so the first call returns the etag the engine
    // saw, but on the second call (after the conflict) returns the new etag.
    let downloadCalls = 0;
    const realUpload = adapter.upload.bind(adapter);
    let firstUpload = true;
    adapter.upload = async (bytes, ifMatch) => {
      if (firstUpload) {
        firstUpload = false;
        // Simulate a concurrent write that raced ahead of us.
        adapter.setRemoteBytes(
          encodeSyncFile({ events: [makeRemoteEvent('rConflict', 'rx', 75)], categoryEvents: [] }, true),
        );
        throw new ConcurrencyError('etag moved');
      }
      return realUpload(bytes, ifMatch);
    };
    const realDownload = adapter.download.bind(adapter);
    adapter.download = async () => {
      downloadCalls += 1;
      return realDownload();
    };

    const result = await engine.performFullSync();
    expect(result.retries).toBeGreaterThanOrEqual(1);
    expect(result.uploadedLocal).toBe(1);
    expect(downloadCalls).toBeGreaterThanOrEqual(2);
  });

  it('does not double-apply a remote event already in processed_events', async () => {
    // Use a realistic recent timestamp so the post-sync retention prune
    // does NOT wipe the `processed_events` row between the two cycles
    // (cutoff is `Date.now() - 30 days`). With a synthetic small int the
    // first cycle would record-then-prune the idempotency row and the
    // second cycle would re-apply.
    const remote = makeRemoteEvent('r1', 'rx1', Date.now() - 1_000);
    adapter.setRemoteBytes(encodeSyncFile({ events: [remote], categoryEvents: [] }, true));

    await engine.performFullSync();
    // Mutate the remote file: same event re-encoded with no other changes.
    adapter.setRemoteBytes(encodeSyncFile({ events: [remote], categoryEvents: [] }, true));

    const second = await engine.performFullSync();
    expect(second.remote.applied).toBe(0);
    expect(second.remote.skipped).toBe(1);
  });

  it('produces an upload whose snapshot captures both base and new events', async () => {
    // Use timestamps recent enough that buildSnapshot's 30-day retention
    // window (createdAt - PRUNE_WINDOW_MS) does NOT prune them out of
    // `coveredEvents` — otherwise body truncation can't detect the body
    // events as covered.
    const recent = Date.now() - 1000;
    const remote1 = makeRemoteEvent('r1', 'rx1', recent - 50, 1000);
    adapter.setRemoteBytes(encodeSyncFile({ events: [remote1], categoryEvents: [] }, true));
    await store.appendEvent(makeLocalEvent('e1', 'x1', recent));
    // Mirror `ExpenseCommandService`: appending the event also projects.
    await store.projectFromEvent({
      id: 'x1',
      amount: 1234,
      currency: 'USD',
      updatedAt: recent,
      deleted: false,
    });

    await engine.performFullSync();

    // Decode what we wrote back. With Phase B truncation, both events
    // are absorbed into the snapshot's coveredEvents and the body is
    // empty. The snapshot carries the projections.
    const { decodeSyncFile } = await import('./codec');
    const lastBytes = adapter.peekBytes();
    expect(lastBytes).not.toBeNull();
    const decoded = decodeSyncFile(lastBytes!, true);
    expect(decoded.events).toEqual([]);
    expect([...(decoded.snapshot?.coveredEvents ?? [])]
      .map((c) => c.eventId)
      .sort())
      .toEqual(['e1', 'r1']);
    expect([...(decoded.snapshot?.expenses.map((p) => p.id) ?? [])].sort())
      .toEqual(['rx1', 'x1']);
  });

  // ----- Category-event sync coverage --------------------------------------

  it('uploads local category events alongside expense events', async () => {
    // Recent timestamps so the 30-day prune window keeps both IDs in
    // `coveredEvents` and body truncation can detect them.
    const recent = Date.now() - 1000;
    await store.appendEvent(makeLocalEvent('e1', 'x1', recent));
    await store.appendCategoryEvent(makeLocalCategoryEvent('ce1', 'c1', recent));

    const result = await engine.performFullSync();

    expect(result.uploadedLocal).toBe(1);
    expect(result.uploadedLocalCategories).toBe(1);

    // Both event logs are now committed.
    expect(await store.findUncommittedEvents()).toHaveLength(0);
    expect(await store.findUncommittedCategoryEvents()).toHaveLength(0);

    // The uploaded file's snapshot carries both events; the body is
    // empty after Phase B truncation.
    const { decodeSyncFile } = await import('./codec');
    const decoded = decodeSyncFile(adapter.peekBytes()!, true);
    expect(decoded.events).toEqual([]);
    expect(decoded.categoryEvents).toEqual([]);
    expect([...(decoded.snapshot?.coveredEvents ?? [])]
      .map((c) => c.eventId)
      .sort())
      .toEqual(['ce1', 'e1']);
  });

  it('downloads and applies remote category events', async () => {
    adapter.setRemoteBytes(
      encodeSyncFile(
        {
          events: [],
          categoryEvents: [makeRemoteCategoryEvent('rc1', 'cx1', 50)],
        },
        true,
      ),
    );

    const result = await engine.performFullSync();

    expect(result.remoteCategories.applied).toBe(1);
    expect(await store.findCategoryById('cx1')).toBeDefined();
  });

  it('uploads only category events when there are no local expense events', async () => {
    await store.appendCategoryEvent(makeLocalCategoryEvent('ce1', 'c1', 100));

    const result = await engine.performFullSync();
    expect(result.uploadedLocal).toBe(0);
    expect(result.uploadedLocalCategories).toBe(1);
    expect(adapter.uploadCount).toBe(1);
  });

  it('round-trips category events: download remote, apply, push local', async () => {
    // Recent timestamps so the 30-day prune window keeps both IDs in
    // `coveredEvents` and body truncation can detect them.
    const recent = Date.now() - 1000;
    adapter.setRemoteBytes(
      encodeSyncFile(
        {
          events: [],
          categoryEvents: [makeRemoteCategoryEvent('rc1', 'cx1', recent - 50)],
        },
        true,
      ),
    );
    await store.appendCategoryEvent(makeLocalCategoryEvent('ce1', 'c2', recent));
    // Mirror the command-service path: appending the event also projects.
    await store.projectCategoryFromEvent({
      id: 'c2',
      name: 'Food',
      icon: 'food',
      color: '#FF0000',
      sortOrder: 0,
      updatedAt: recent,
      deleted: false,
    });

    const result = await engine.performFullSync();

    expect(result.remoteCategories.applied).toBe(1);
    expect(result.uploadedLocalCategories).toBe(1);

    const { decodeSyncFile } = await import('./codec');
    const decoded = decodeSyncFile(adapter.peekBytes()!, true);
    // Phase B: both events end up in the snapshot's coveredEvents,
    // not in the body. The snapshot's categories include the merged
    // remote + local category projections.
    expect(decoded.categoryEvents).toEqual([]);
    expect([...(decoded.snapshot?.coveredEvents ?? [])]
      .map((c) => c.eventId)
      .sort())
      .toEqual(['ce1', 'rc1']);
    expect([...(decoded.snapshot?.categories.map((c) => c.id) ?? [])].sort())
      .toEqual(['c2', 'cx1']);
  });

  it('idempotently skips re-applied category events', async () => {
    // Same retention-prune caveat as the expense-event idempotency test
    // above: use a recent timestamp so the post-sync prune does not
    // delete the `processed_events` row between the two cycles.
    const remote = makeRemoteCategoryEvent('rc1', 'cx1', Date.now() - 1_000);
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [remote] }, true));

    await engine.performFullSync();
    // Mutate the remote file with the same category event re-encoded.
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [remote] }, true));

    const second = await engine.performFullSync();
    expect(second.remoteCategories.applied).toBe(0);
    expect(second.remoteCategories.skipped).toBe(1);
  });

  // ----- Retention prune ---------------------------------------------------
  //
  // After every successful cycle the engine runs `pruneCommittedEvents`
  // with cutoff `Date.now() - PRUNE_WINDOW_MS` (30 days). Predicate:
  //   - expense_events / category_events: committed = 1 AND timestamp < cutoff
  //   - processed_events:                  timestamp < cutoff
  // Recent rows and uncommitted rows always survive.

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  it('reports zero pruned rows on a steady-state cycle', async () => {
    const result = await engine.performFullSync();

    expect(result.pruned).toEqual({
      expenseEvents: 0,
      categoryEvents: 0,
      processedEvents: 0,
    });
  });

  it('prunes old committed events but keeps recent and uncommitted ones', async () => {
    const old = Date.now() - THIRTY_DAYS_MS - 1_000;
    const recent = Date.now() - 1_000;

    // Two old committed events (eligible for prune) + one recent
    // committed event (just inside the window) + one uncommitted event
    // (must always survive, even when ancient).
    const oldCommitted = { ...makeLocalEvent('e-old', 'x-old', old), committed: true };
    const recentCommitted = { ...makeLocalEvent('e-recent', 'x-recent', recent), committed: true };
    const oldUncommitted = makeLocalEvent('e-pending', 'x-pending', old);
    await store.appendEvent(oldCommitted);
    await store.appendEvent(recentCommitted);
    await store.appendEvent(oldUncommitted);

    const result = await engine.performFullSync();

    // The pending event was uploaded this cycle and marked committed,
    // but its timestamp is still inside the window vs `now` (we used
    // `old` for its timestamp — well outside the window). The prune
    // runs AFTER mark-committed, so the freshly-committed-but-old event
    // also gets deleted. That is the intended behaviour: anything the
    // cloud has and that has aged past the retention window is fair
    // game.
    expect(result.pruned.expenseEvents).toBe(2);

    const remaining = await store.findAllEvents();
    expect(remaining.map((e) => e.eventId)).toEqual(['e-recent']);
  });

  it('prunes old category events with the same predicate', async () => {
    const old = Date.now() - THIRTY_DAYS_MS - 1_000;
    const recent = Date.now() - 1_000;

    await store.appendCategoryEvent({
      ...makeLocalCategoryEvent('ce-old', 'c-old', old),
      committed: true,
    });
    await store.appendCategoryEvent({
      ...makeLocalCategoryEvent('ce-recent', 'c-recent', recent),
      committed: true,
    });
    // Pending category event with an ancient timestamp. The engine
    // uploads it during this cycle and marks it committed; prune then
    // sees committed = 1 AND timestamp < cutoff and deletes it too —
    // mirroring the expense-event prune test above. The intended
    // semantics: anything the cloud has and that has aged past the
    // retention window is fair game.
    await store.appendCategoryEvent(makeLocalCategoryEvent('ce-pending', 'c-pending', old));

    const result = await engine.performFullSync();

    expect(result.pruned.categoryEvents).toBe(2);
    const remaining = await store.findAllCategoryEvents();
    expect(remaining.map((e) => e.eventId)).toEqual(['ce-recent']);
  });

  it('prunes old processed_events purely by timestamp (no committed flag)', async () => {
    const old = Date.now() - THIRTY_DAYS_MS - 1_000;
    const recent = Date.now() - 1_000;

    await store.recordProcessedEvent('p-old', old);
    await store.recordProcessedEvent('p-recent', recent);

    const result = await engine.performFullSync();

    expect(result.pruned.processedEvents).toBe(1);
    expect(await store.isEventProcessed('p-old')).toBe(false);
    expect(await store.isEventProcessed('p-recent')).toBe(true);
  });

  it('keeps a successful sync result when the prune step throws', async () => {
    // The prune is best-effort housekeeping: a transient
    // `database is locked` from concurrent writers must not mask the
    // engine's real outcome to the caller.
    store.pruneCommittedEvents = async () => {
      throw new Error('database is locked');
    };
    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));

    const result = await engine.performFullSync();

    expect(result.uploadedLocal).toBe(1);
    expect(result.pruned).toEqual({
      expenseEvents: 0,
      categoryEvents: 0,
      processedEvents: 0,
    });
  });

  it('uses Date.now() - PRUNE_WINDOW_MS as the prune cutoff', async () => {
    // Pins the contract that on-device prune and snapshotBuilder share
    // the same cutoff. If they ever drift, the engine could delete an
    // event whose id still rides in a freshly-uploaded snapshot's
    // `coveredEvents`, and the next download would silently re-apply
    // it (a no-op under LWW, but extra CPU and bridge traffic).
    let captured: number | undefined;
    store.pruneCommittedEvents = async (cutoff) => {
      captured = cutoff;
      return { expenseEvents: 0, categoryEvents: 0, processedEvents: 0 };
    };

    const before = Date.now();
    await engine.performFullSync();
    const after = Date.now();

    expect(captured).toBeDefined();
    // The cutoff must equal `someInstant - PRUNE_WINDOW_MS` for an
    // instant in `[before, after]`. Tolerate clock granularity by
    // checking the open interval.
    expect(captured!).toBeGreaterThanOrEqual(before - THIRTY_DAYS_MS);
    expect(captured!).toBeLessThanOrEqual(after - THIRTY_DAYS_MS);
  });

  it('does not prune when the cycle fails with a non-ConcurrencyError', async () => {
    // A genuine failure (network error, decode error, …) re-throws out
    // of performFullSync — prune must not run, because we don't know
    // whether our local writes ever made it to the cloud.
    let pruneCalls = 0;
    store.pruneCommittedEvents = async () => {
      pruneCalls += 1;
      return { expenseEvents: 0, categoryEvents: 0, processedEvents: 0 };
    };
    adapter.download = async () => {
      throw new Error('network down');
    };

    await expect(engine.performFullSync()).rejects.toThrow('network down');
    expect(pruneCalls).toBe(0);
  });

  it('keeps an event whose timestamp equals the cutoff exactly', async () => {
    // Boundary check on the in-memory store's prune predicate (the
    // engine just forwards a cutoff to it). The predicate is strict
    // `<`, so `timestamp === cutoff` must survive — this locks the
    // in-memory contract to the same semantics the SQLite predicate
    // enforces (`timestamp < ?`).
    const cutoff = 1_700_000_000_000;
    await store.appendEvent({
      ...makeLocalEvent('e-boundary', 'x-b', cutoff),
      committed: true,
    });
    await store.appendEvent({
      ...makeLocalEvent('e-just-below', 'x-jb', cutoff - 1),
      committed: true,
    });

    const result = await store.pruneCommittedEvents(cutoff);

    expect(result.expenseEvents).toBe(1);
    const remaining = await store.findAllEvents();
    expect(remaining.map((e) => e.eventId)).toEqual(['e-boundary']);
  });
});
