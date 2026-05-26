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
    const remote = makeRemoteEvent('r1', 'rx1', 50);
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
    const remote = makeRemoteCategoryEvent('rc1', 'cx1', 50);
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [remote] }, true));

    await engine.performFullSync();
    // Mutate the remote file with the same category event re-encoded.
    adapter.setRemoteBytes(encodeSyncFile({ events: [], categoryEvents: [remote] }, true));

    const second = await engine.performFullSync();
    expect(second.remoteCategories.applied).toBe(0);
    expect(second.remoteCategories.skipped).toBe(1);
  });
});
