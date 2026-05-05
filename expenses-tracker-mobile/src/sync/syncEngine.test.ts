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
import { TEST_USER_ID } from '../test/fixtures';
import type { EventEntry, ExpenseEvent } from '../domain/types';

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
    userId: TEST_USER_ID,
  }),
  committed: false,
  userId: TEST_USER_ID,
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
    userId: TEST_USER_ID,
  },
  userId: TEST_USER_ID,
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
      userId: TEST_USER_ID,
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
    expect(await store.findUncommittedEvents(TEST_USER_ID)).toHaveLength(0);
  });

  it('downloads + applies remote events on first cycle', async () => {
    // Seed the remote file with one event and a known etag.
    const remoteEvent = makeRemoteEvent('r1', 'rx1', 50);
    adapter.setRemoteBytes(encodeSyncFile({ events: [remoteEvent] }, true));

    const result = await engine.performFullSync();

    expect(result.downloadedRemote).toBe(true);
    expect(result.remote.applied).toBe(1);
    expect(result.uploadedLocal).toBe(0);
    // No upload because there were no local events to push.
    expect(adapter.uploadCount).toBe(0);
    expect(await store.findProjectionById('rx1', TEST_USER_ID)).toBeDefined();
  });

  it('round-trips: download remote, apply, push local in one cycle', async () => {
    adapter.setRemoteBytes(encodeSyncFile({ events: [makeRemoteEvent('r1', 'rx1', 50)] }, true));
    await store.appendEvent(makeLocalEvent('e1', 'x1', 100));

    const result = await engine.performFullSync();

    expect(result.remote.applied).toBe(1);
    expect(result.uploadedLocal).toBe(1);
    expect(adapter.uploadCount).toBe(1);
  });

  it('skips remote-apply on second sync when etag is unchanged', async () => {
    adapter.setRemoteBytes(encodeSyncFile({ events: [makeRemoteEvent('r1', 'rx1', 50)] }, true));

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
    adapter.setRemoteBytes(encodeSyncFile({ events: [] }, true));
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
          encodeSyncFile({ events: [makeRemoteEvent('rConflict', 'rx', 75)] }, true),
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
    adapter.setRemoteBytes(encodeSyncFile({ events: [remote] }, true));

    await engine.performFullSync();
    // Mutate the remote file: same event re-encoded with no other changes.
    adapter.setRemoteBytes(encodeSyncFile({ events: [remote] }, true));

    const second = await engine.performFullSync();
    expect(second.remote.applied).toBe(0);
    expect(second.remote.skipped).toBe(1);
  });

  it('produces an upload that includes both base and new events sorted', async () => {
    const remote1 = makeRemoteEvent('r1', 'rx1', 50, 1000);
    adapter.setRemoteBytes(encodeSyncFile({ events: [remote1] }, true));
    await store.appendEvent(makeLocalEvent('e1', 'x1', 200));

    await engine.performFullSync();

    // Decode what we wrote back and assert ordering.
    const { decodeSyncFile } = await import('./codec');
    const lastBytes = adapter.peekBytes();
    expect(lastBytes).not.toBeNull();
    const decoded = decodeSyncFile(lastBytes!, true);
    expect(decoded.events.map((e) => e.eventId)).toEqual(['r1', 'e1']);
  });
});
