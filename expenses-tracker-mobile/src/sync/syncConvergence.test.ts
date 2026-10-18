/**
 * Engine-level regression tests for cross-device convergence: body
 * compaction and applied-count semantics after processed-event IDs
 * expire, snapshot rebuilds racing local writes, deletes ordered before
 * their creates, and retries of remote changes that failed to apply.
 * Synthetic fixtures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncEngine } from './syncEngine';
import { decodeSyncFile, encodeSyncFile } from './codec';
import { PRUNE_WINDOW_MS, SNAPSHOT_VERSION } from './snapshotBuilder';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { InMemoryCloudDriveAdapter } from '../test/inMemoryCloudDriveAdapter';
import type {
  Category,
  CategoryEventEntry,
  EventEntry,
  EventSyncFile,
  EventType,
  ExpenseProjection,
  SyncFileSnapshot,
} from '../domain/types';

const expenseEntry = (
  eventId: string,
  id: string,
  timestamp: number,
  overrides: { eventType?: EventType; updatedAt?: number; deleted?: boolean } = {},
): EventEntry => ({
  eventId,
  timestamp,
  eventType: overrides.eventType ?? 'CREATED',
  expenseId: id,
  payload: {
    id,
    amount: 100,
    currency: 'EUR',
    updatedAt: overrides.updatedAt ?? timestamp,
    deleted: overrides.deleted ?? false,
  },
});

const categoryEntry = (
  eventId: string,
  id: string,
  timestamp: number,
  overrides: { eventType?: EventType; deleted?: boolean; templateKey?: string } = {},
): CategoryEventEntry => ({
  eventId,
  timestamp,
  eventType: overrides.eventType ?? 'CREATED',
  categoryId: id,
  payload: {
    id,
    name: `Category ${id}`,
    icon: 'tag',
    color: '#123456',
    sortOrder: 1,
    updatedAt: timestamp,
    deleted: overrides.deleted ?? false,
    ...(overrides.templateKey !== undefined ? { templateKey: overrides.templateKey } : {}),
  },
});

const snapshotOf = (
  createdAt: number,
  expenses: ReadonlyArray<ExpenseProjection> = [],
  categories: ReadonlyArray<Category> = [],
): SyncFileSnapshot => ({
  version: SNAPSHOT_VERSION,
  createdAt,
  expenses,
  categories,
  coveredEvents: [],
});

const encode = (file: EventSyncFile): Uint8Array => encodeSyncFile(file, true);
const decode = (bytes: Uint8Array): EventSyncFile => decodeSyncFile(bytes, true);
const byId = <T extends { readonly id: string }>(rows: ReadonlyArray<T>): T[] =>
  [...rows].sort((a, b) => a.id.localeCompare(b.id));

async function appendLocal(store: InMemoryLocalStore, entry: EventEntry): Promise<void> {
  await store.appendEvent({
    eventId: entry.eventId,
    timestamp: entry.timestamp,
    eventType: entry.eventType,
    expenseId: entry.expenseId,
    payload: JSON.stringify(entry.payload),
    committed: false,
  });
  await store.projectFromEvent(entry.payload);
}

async function expectSameState(a: InMemoryLocalStore, b: InMemoryLocalStore): Promise<void> {
  expect(byId(await b.findAllProjections())).toEqual(byId(await a.findAllProjections()));
  expect(byId(await b.findAllCategories())).toEqual(byId(await a.findAllCategories()));
}

describe('SyncEngine compaction after processed IDs expire', () => {
  let adapter: InMemoryCloudDriveAdapter;
  let store: InMemoryLocalStore;

  beforeEach(() => {
    adapter = new InMemoryCloudDriveAdapter();
    store = new InMemoryLocalStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports no false applications for expired expense and category events and compacts them on upload', async () => {
    // Given: a warm device whose processed IDs for 411 expense + 4 category events have expired
    const now = Date.now();
    const old = now - PRUNE_WINDOW_MS - 60_000;
    const expenseEvents = Array.from({ length: 411 }, (_, i) =>
      i < 400
        ? expenseEntry(`old-${i}`, `x-${i}`, old + i)
        : expenseEntry(`old-${i}`, `x-${i - 400}`, old + i, { eventType: 'UPDATED' }),
    );
    const categoryEvents = [
      categoryEntry('c1-create', 'c1', old),
      categoryEntry('c1-update', 'c1', old + 1, { eventType: 'UPDATED' }),
      categoryEntry('c2-create', 'c2', old + 2),
      categoryEntry('c2-delete', 'c2', old + 3, { eventType: 'DELETED', deleted: true }),
    ];
    const snapshotRows = Array.from({ length: 20 }, (_, i) =>
      expenseEntry(`s-${i}`, `s-${i}`, old - 50_000 + i).payload,
    ) as ExpenseProjection[];
    adapter.setRemoteBytes(encode({
      events: expenseEvents,
      categoryEvents,
      snapshot: snapshotOf(old - 10_000, snapshotRows),
    }));
    const engine = createSyncEngine({ store, adapter });
    await engine.performFullSync();
    expect(await store.findAllProcessedEvents()).toEqual([]);
    await appendLocal(store, expenseEntry('local', 'new-expense', now));
    adapter.setRemoteBytes(adapter.peekBytes()!);

    // When
    const first = await engine.performFullSync();
    const outgoing = decode(adapter.peekBytes()!);
    const repeat = await engine.performFullSync();
    adapter.setRemoteBytes(adapter.peekBytes()!);
    const revalidated = await engine.performFullSync();

    // Then
    expect(first.remote).toEqual({ applied: 0, skipped: 411, errors: 0 });
    expect(first.remoteCategories).toEqual({ applied: 0, skipped: 4, errors: 0 });
    expect(first.uploadedLocal).toBe(1);
    expect(outgoing.events).toEqual([]);
    expect(outgoing.categoryEvents).toEqual([]);
    expect(outgoing.snapshot?.expenses).toHaveLength(421);
    expect(repeat.remote.applied + repeat.remoteCategories.applied).toBe(0);
    expect(repeat.uploadedLocal).toBe(0);
    expect(repeat.downloadedRemote).toBe(false);
    expect(adapter.notModifiedCount).toBe(1);
    expect(revalidated.downloadedRemote).toBe(true);
    expect(revalidated.remote).toEqual({ applied: 0, skipped: 0, errors: 0 });
    expect(revalidated.remoteCategories).toEqual({ applied: 0, skipped: 0, errors: 0 });
    const cold = new InMemoryLocalStore();
    await createSyncEngine({ store: cold, adapter }).performFullSync();
    await expectSameState(store, cold);
  });

  it('bootstraps tombstones and resurrections from a compacted file and accepts a later resurrection', async () => {
    // Given: expired history with deletes, a resurrection, and a late stale delete
    const now = Date.now();
    const old = now - PRUNE_WINDOW_MS - 60_000;
    adapter.setRemoteBytes(encode({
      events: [
        expenseEntry('x-c', 'x', old),
        expenseEntry('x-d', 'x', old + 1, { eventType: 'DELETED', deleted: true }),
        expenseEntry('y-c', 'y', old),
        expenseEntry('y-d', 'y', old + 1, { eventType: 'DELETED', deleted: true }),
        expenseEntry('y-r', 'y', old + 2, { eventType: 'UPDATED' }),
        expenseEntry('z-c', 'z', old),
        expenseEntry('z-u', 'z', old + 5, { eventType: 'UPDATED' }),
        expenseEntry('z-stale-d', 'z', old + 6, { eventType: 'DELETED', deleted: true, updatedAt: old + 3 }),
      ],
      categoryEvents: [
        categoryEntry('c-c', 'c', old),
        categoryEntry('c-d', 'c', old + 1, { eventType: 'DELETED', deleted: true }),
        categoryEntry('d-c', 'd', old),
        categoryEntry('d-d', 'd', old + 1, { eventType: 'DELETED', deleted: true }),
        categoryEntry('d-r', 'd', old + 2, { eventType: 'UPDATED' }),
      ],
    }));
    await createSyncEngine({ store, adapter }).performFullSync();
    await appendLocal(store, expenseEntry('local', 'new-expense', now));
    await createSyncEngine({ store, adapter }).performFullSync();
    const compacted = decode(adapter.peekBytes()!);

    // When
    const cold = new InMemoryLocalStore();
    const coldEngine = createSyncEngine({ store: cold, adapter });
    await coldEngine.performFullSync();
    const bootstrapped = new InMemoryLocalStore();
    await createSyncEngine({ store: bootstrapped, adapter }).performFullSync();
    const editor = new InMemoryLocalStore();
    await createSyncEngine({ store: editor, adapter }).performFullSync();
    await appendLocal(editor, expenseEntry('x-resurrect', 'x', now + 1, { eventType: 'UPDATED' }));
    await createSyncEngine({ store: editor, adapter }).performFullSync();
    const resurrected = await coldEngine.performFullSync();

    // Then
    expect(compacted.events).toEqual([]);
    expect(compacted.categoryEvents).toEqual([]);
    await expectSameState(store, bootstrapped);
    expect((await store.findProjectionById('x'))?.deleted).toBe(true);
    expect((await store.findProjectionById('y'))?.deleted).toBe(false);
    expect((await store.findProjectionById('z'))).toMatchObject({ deleted: false, updatedAt: old + 5 });
    expect((await store.findCategoryById('c'))?.deleted).toBe(true);
    expect((await store.findCategoryById('d'))?.deleted).toBe(false);
    expect(resurrected.remote.applied).toBe(1);
    expect(await cold.findProjectionById('x')).toMatchObject({ deleted: false, updatedAt: now + 1 });
  });

  it('applies a backdated write from a device that was offline past the retention window', async () => {
    // Given: device B goes offline; device A edits and compacts the file
    const now = Date.now();
    const old = now - PRUNE_WINDOW_MS - 60_000;
    adapter.setRemoteBytes(encode({
      events: [expenseEntry('w-c', 'w', old), expenseEntry('v-c', 'v', old)],
      categoryEvents: [],
    }));
    const storeB = new InMemoryLocalStore();
    const engineA = createSyncEngine({ store, adapter });
    const engineB = createSyncEngine({ store: storeB, adapter });
    await engineA.performFullSync();
    await engineB.performFullSync();
    const offlineAt = now - PRUNE_WINDOW_MS - 10_000;
    await appendLocal(storeB, expenseEntry('b-z', 'z', offlineAt));
    await appendLocal(storeB, expenseEntry('b-w', 'w', offlineAt, { eventType: 'UPDATED' }));
    await appendLocal(store, expenseEntry('a-w', 'w', now, { eventType: 'UPDATED' }));
    await engineA.performFullSync();

    // When
    await engineB.performFullSync();
    const resultA = await engineA.performFullSync();

    // Then
    expect(resultA.remote.applied).toBe(1);
    expect(await store.findProjectionById('z')).toMatchObject({ updatedAt: offlineAt, deleted: false });
    expect((await store.findProjectionById('w'))?.updatedAt).toBe(now);
    await expectSameState(store, storeB);
  });

  it('keeps an expired event the uploader could not apply instead of compacting it away', async () => {
    // Given: a remote category whose apply fails locally on the template-key constraint
    const now = Date.now();
    const old = now - PRUNE_WINDOW_MS - 60_000;
    await store.projectCategoryFromEvent({
      id: 'seed-food', templateKey: 'food', icon: 'food', color: '#000000', sortOrder: 0, updatedAt: 0, deleted: false,
    });
    const conflicting = categoryEntry('k-create', 'k', old, { templateKey: 'food' });
    adapter.setRemoteBytes(encode({ events: [], categoryEvents: [conflicting] }));
    await appendLocal(store, expenseEntry('local', 'new-expense', now));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // When
    const result = await createSyncEngine({ store, adapter }).performFullSync();
    const outgoing = decode(adapter.peekBytes()!);

    // Then
    expect(result.remoteCategories).toEqual({ applied: 0, skipped: 0, errors: 1 });
    expect(outgoing.categoryEvents).toEqual([conflicting]);
  });

  it('counts no change for snapshot rows with equal or older updatedAt and keeps local content', async () => {
    // Given
    const local = expenseEntry('local', 'x', 200);
    await store.projectFromEvent(local.payload);
    adapter.setRemoteBytes(encode({
      events: [],
      categoryEvents: [],
      snapshot: snapshotOf(Date.now(), [
        { ...local.payload, amount: 999, deleted: false } as ExpenseProjection,
        { id: 'y', amount: 1, currency: 'EUR', updatedAt: 50, deleted: false },
      ]),
    }));
    await store.projectFromEvent({ id: 'y', amount: 2, currency: 'EUR', updatedAt: 60, deleted: false });

    // When
    const result = await createSyncEngine({ store, adapter }).performFullSync();

    // Then
    expect(result.remote.applied).toBe(0);
    expect((await store.findProjectionById('x'))?.amount).toBe(100);
    expect((await store.findProjectionById('y'))?.amount).toBe(2);
  });
});

describe('SyncEngine snapshot refresh triggers at their boundaries', () => {
  const NOW = 10_000_000_000_000;
  let adapter: InMemoryCloudDriveAdapter;
  let store: InMemoryLocalStore;

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    adapter = new InMemoryCloudDriveAdapter();
    store = new InMemoryLocalStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function uploadWithRemoteEvents(events: ReadonlyArray<EventEntry>): Promise<EventSyncFile> {
    adapter.setRemoteBytes(encode({ events, categoryEvents: [], snapshot: snapshotOf(NOW - 1_000) }));
    await appendLocal(store, expenseEntry('local', 'local', NOW));
    await createSyncEngine({ store, adapter }).performFullSync();
    return decode(adapter.peekBytes()!);
  }

  it('keeps the snapshot for an event exactly at the retention cutoff', async () => {
    // When
    const outgoing = await uploadWithRemoteEvents([expenseEntry('edge', 'edge', NOW - PRUNE_WINDOW_MS)]);

    // Then
    expect(outgoing.snapshot?.createdAt).toBe(NOW - 1_000);
    expect(outgoing.events.map((e) => e.eventId)).toEqual(['edge', 'local']);
  });

  it('refreshes and compacts for an event one millisecond past the retention cutoff', async () => {
    // When
    const outgoing = await uploadWithRemoteEvents([expenseEntry('expired', 'expired', NOW - PRUNE_WINDOW_MS - 1)]);

    // Then
    expect(outgoing.snapshot?.createdAt).toBe(NOW);
    expect(outgoing.events).toEqual([]);
  });

  it('keeps the snapshot at exactly 500 post-cutoff events and refreshes at 501', async () => {
    // Given
    const recent = (n: number): EventEntry[] =>
      Array.from({ length: n }, (_, i) => expenseEntry(`r-${i}`, `r-${i}`, NOW - 500 + i));

    // When
    const atThreshold = await uploadWithRemoteEvents(recent(499));
    store = new InMemoryLocalStore();
    adapter = new InMemoryCloudDriveAdapter();
    const pastThreshold = await uploadWithRemoteEvents(recent(500));

    // Then
    expect(atThreshold.snapshot?.createdAt).toBe(NOW - 1_000);
    expect(atThreshold.events).toHaveLength(500);
    expect(pastThreshold.snapshot?.createdAt).toBe(NOW);
    expect(pastThreshold.events).toEqual([]);
  });
});

describe('SyncEngine convergence regressions', () => {
  let adapter: InMemoryCloudDriveAdapter;
  let store: InMemoryLocalStore;

  beforeEach(() => {
    adapter = new InMemoryCloudDriveAdapter();
    store = new InMemoryLocalStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads a local expense committed while the snapshot is being rebuilt', async () => {
    // Given: an upload that rebuilds the snapshot, with a local write landing mid-build
    const now = Date.now();
    const old = now - PRUNE_WINDOW_MS - 60_000;
    adapter.setRemoteBytes(encode({
      events: [expenseEntry('old', 'old', old)],
      categoryEvents: [],
      snapshot: snapshotOf(old - 1_000),
    }));
    const engine = createSyncEngine({ store, adapter });
    await engine.performFullSync();
    await appendLocal(store, expenseEntry('first', 'first', now));
    const findAllEvents = store.findAllEvents.bind(store);
    let racing = true;
    store.findAllEvents = async () => {
      if (racing) {
        racing = false;
        await appendLocal(store, expenseEntry('racer', 'racer', now + 1));
      }
      return findAllEvents();
    };

    // When
    await engine.performFullSync();
    await engine.performFullSync();

    // Then
    const cold = new InMemoryLocalStore();
    await createSyncEngine({ store: cold, adapter }).performFullSync();
    expect(await cold.findProjectionById('racer')).toMatchObject({ id: 'racer', updatedAt: now + 1 });
    expect(await store.findUncommittedEvents()).toEqual([]);
  });

  it('converges on a delete from a device whose clock is behind the creator', async () => {
    // Given: B deletes A's expense, but B's event timestamp sorts before A's create
    const now = Date.now();
    adapter.setRemoteBytes(encode({ events: [], categoryEvents: [], snapshot: snapshotOf(now - 1_000) }));
    const [storeA, storeB, storeC] = [new InMemoryLocalStore(), new InMemoryLocalStore(), new InMemoryLocalStore()];
    const syncA = createSyncEngine({ store: storeA, adapter });
    const syncB = createSyncEngine({ store: storeB, adapter });
    const syncC = createSyncEngine({ store: storeC, adapter });
    await syncA.performFullSync();
    await syncB.performFullSync();
    await syncC.performFullSync();
    await appendLocal(storeA, expenseEntry('x-create', 'x', now + 20_000));
    await syncA.performFullSync();
    await syncB.performFullSync();
    await appendLocal(storeB, expenseEntry('x-delete', 'x', now + 10_000, {
      eventType: 'DELETED', deleted: true, updatedAt: now + 20_001,
    }));
    await syncB.performFullSync();

    // When: C applies the body, then rebuilds the snapshot after a bulk write
    await syncC.performFullSync();
    await syncA.performFullSync();
    const cold = new InMemoryLocalStore();
    await createSyncEngine({ store: cold, adapter }).performFullSync();
    for (let i = 0; i < 501; i += 1) {
      await appendLocal(storeC, expenseEntry(`c-${i}`, `c-${i}`, now + 30_000 + i));
    }
    await syncC.performFullSync();
    const afterRebuild = new InMemoryLocalStore();
    await createSyncEngine({ store: afterRebuild, adapter }).performFullSync();

    // Then
    for (const device of [storeA, storeB, storeC, cold, afterRebuild]) {
      expect(await device.findProjectionById('x')).toMatchObject({ deleted: true, updatedAt: now + 20_001 });
    }
  });

  it('retries a remote change that failed to apply on the next download-only sync', async () => {
    // Given: a transient failure while applying a remote expense
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    adapter.setRemoteBytes(encode({ events: [expenseEntry('remote', 'x1', Date.now() - 10)], categoryEvents: [] }));
    const projectFromEvent = store.projectFromEvent.bind(store);
    let failing = true;
    store.projectFromEvent = async (row) => {
      if (failing && row.id === 'x1') throw new Error('transient');
      return projectFromEvent(row);
    };
    const engine = createSyncEngine({ store, adapter });
    const failed = await engine.performFullSync();
    failing = false;

    // When
    const retried = await engine.performFullSync();
    const idle = await engine.performFullSync();

    // Then
    expect(failed.remote.errors).toBe(1);
    expect(retried.downloadedRemote).toBe(true);
    expect(retried.remote).toEqual({ applied: 1, skipped: 0, errors: 0 });
    expect(await store.findProjectionById('x1')).toBeDefined();
    expect(idle.downloadedRemote).toBe(false);
    expect(adapter.notModifiedCount).toBe(1);
  });

  it('retries a remote change that failed to apply on the next upload sync', async () => {
    // Given: the failure happens in a cycle that also uploads a local write
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const now = Date.now();
    adapter.setRemoteBytes(encode({ events: [expenseEntry('remote', 'x1', now - 10)], categoryEvents: [] }));
    const projectFromEvent = store.projectFromEvent.bind(store);
    let failing = true;
    store.projectFromEvent = async (row) => {
      if (failing && row.id === 'x1') throw new Error('transient');
      return projectFromEvent(row);
    };
    const engine = createSyncEngine({ store, adapter });
    await appendLocal(store, expenseEntry('local-1', 'l1', now));
    const failed = await engine.performFullSync();
    failing = false;
    await appendLocal(store, expenseEntry('local-2', 'l2', now + 1));

    // When
    const retried = await engine.performFullSync();

    // Then
    expect(failed.remote.errors).toBe(1);
    expect(retried.remote).toEqual({ applied: 1, skipped: 0, errors: 0 });
    expect(retried.uploadedLocal).toBe(1);
    expect(await store.findProjectionById('x1')).toBeDefined();
  });
});
