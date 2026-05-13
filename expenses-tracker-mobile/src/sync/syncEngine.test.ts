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

    // No local changes, no remote changes — second cycle is mostly idle.
    const second = await engine.performFullSync();
    expect(second.downloadedRemote).toBe(false);
    expect(second.remote.applied).toBe(0);
    expect(second.uploadedLocal).toBe(0);
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

  it('produces an upload that includes both base and new events sorted', async () => {
    const remote1 = makeRemoteEvent('r1', 'rx1', 50, 1000);
    adapter.setRemoteBytes(encodeSyncFile({ events: [remote1], categoryEvents: [] }, true));
    await store.appendEvent(makeLocalEvent('e1', 'x1', 200));

    await engine.performFullSync();

    // Decode what we wrote back and assert ordering.
    const { decodeSyncFile } = await import('./codec');
    const lastBytes = adapter.peekBytes();
    expect(lastBytes).not.toBeNull();
    const decoded = decodeSyncFile(lastBytes!, true);
    expect(decoded.events.map((e) => e.eventId)).toEqual(['r1', 'e1']);
  });

  // ----- Category-event sync coverage --------------------------------------

  it('uploads local category events alongside expense events', async () => {
    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));
    await store.appendCategoryEvent(makeLocalCategoryEvent('ce1', 'c1', 100));

    const result = await engine.performFullSync();

    expect(result.uploadedLocal).toBe(1);
    expect(result.uploadedLocalCategories).toBe(1);

    // Both event logs are now committed.
    expect(await store.findUncommittedEvents()).toHaveLength(0);
    expect(await store.findUncommittedCategoryEvents()).toHaveLength(0);

    // The uploaded file carries the category events.
    const { decodeSyncFile } = await import('./codec');
    const decoded = decodeSyncFile(adapter.peekBytes()!, true);
    expect(decoded.categoryEvents).toHaveLength(1);
    expect(decoded.categoryEvents[0]?.eventId).toBe('ce1');
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
    adapter.setRemoteBytes(
      encodeSyncFile(
        {
          events: [],
          categoryEvents: [makeRemoteCategoryEvent('rc1', 'cx1', 50)],
        },
        true,
      ),
    );
    await store.appendCategoryEvent(makeLocalCategoryEvent('ce1', 'c2', 100));

    const result = await engine.performFullSync();

    expect(result.remoteCategories.applied).toBe(1);
    expect(result.uploadedLocalCategories).toBe(1);

    const { decodeSyncFile } = await import('./codec');
    const decoded = decodeSyncFile(adapter.peekBytes()!, true);
    expect(decoded.categoryEvents.map((e) => e.eventId)).toEqual(['rc1', 'ce1']);
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
