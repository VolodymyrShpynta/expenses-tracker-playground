/**
 * Snapshot builder tests — verifies that `buildSnapshot` captures the
 * full local read-model (including soft-deleted rows) and the union of
 * known event IDs from both `processed_events` and the local event-log
 * tables.
 *
 * The snapshot is read-only output; these tests verify shape and
 * content, not side effects.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { buildSnapshot, SNAPSHOT_VERSION } from './snapshotBuilder';
import type {
  Category,
  CategoryEvent,
  ExpenseEvent,
  ExpenseProjection,
} from '../domain/types';

const projection = (
  id: string,
  updatedAt: number,
  deleted = false,
): ExpenseProjection => ({
  id,
  description: `desc-${id}`,
  amount: 100,
  currency: 'USD',
  categoryId: 'cat-1',
  date: '2024-01-01',
  updatedAt,
  deleted,
});

const category = (
  id: string,
  updatedAt: number,
  deleted = false,
): Category => ({
  id,
  name: `Cat ${id}`,
  icon: 'x',
  color: '#000',
  sortOrder: 0,
  updatedAt,
  deleted,
});

const expenseEvent = (
  eventId: string,
  expenseId: string,
  timestamp: number,
): ExpenseEvent => ({
  eventId,
  expenseId,
  timestamp,
  eventType: 'CREATED',
  payload: JSON.stringify({
    id: expenseId,
    amount: 100,
    currency: 'USD',
    updatedAt: timestamp,
    deleted: false,
  }),
  committed: false,
});

const categoryEvent = (
  eventId: string,
  categoryId: string,
  timestamp: number,
): CategoryEvent => ({
  eventId,
  categoryId,
  timestamp,
  eventType: 'CREATED',
  payload: JSON.stringify({
    id: categoryId,
    name: 'x',
    icon: 'x',
    color: '#000',
    sortOrder: 0,
    updatedAt: timestamp,
    deleted: false,
  }),
  committed: false,
});

describe('buildSnapshot', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    store = new InMemoryLocalStore();
  });

  it('produces an empty snapshot for an empty store', async () => {
    const snapshot = await buildSnapshot(store, { createdAt: 12345 });

    expect(snapshot).toEqual({
      version: SNAPSHOT_VERSION,
      createdAt: 12345,
      expenses: [],
      categories: [],
      coveredEvents: [],
    });
  });

  it('defaults createdAt to Date.now() when omitted', async () => {
    const before = Date.now();
    const snapshot = await buildSnapshot(store);
    const after = Date.now();

    expect(snapshot.createdAt).toBeGreaterThanOrEqual(before);
    expect(snapshot.createdAt).toBeLessThanOrEqual(after);
  });

  it('includes both active and soft-deleted projections', async () => {
    await store.projectFromEvent(projection('a', 100, false));
    await store.projectFromEvent(projection('b', 200, true));

    const snapshot = await buildSnapshot(store, { createdAt: 0 });
    const ids = snapshot.expenses.map((p) => p.id).sort();

    expect(ids).toEqual(['a', 'b']);
    expect(snapshot.expenses.find((p) => p.id === 'b')?.deleted).toBe(true);
  });

  it('includes both active and soft-deleted categories', async () => {
    await store.projectCategoryFromEvent(category('a', 100, false));
    await store.projectCategoryFromEvent(category('b', 200, true));

    const snapshot = await buildSnapshot(store, { createdAt: 0 });
    const ids = snapshot.categories.map((c) => c.id).sort();

    expect(ids).toEqual(['a', 'b']);
    expect(snapshot.categories.find((c) => c.id === 'b')?.deleted).toBe(true);
  });

  it('coveredEvents includes processed_events (remote-origin) with timestamps', async () => {
    // Use createdAt = 1_000_000_000 and recent timestamps so nothing
    // ages out of the 30-day retention window.
    await store.recordProcessedEvent('remote-1', 1_000_000_000);
    await store.recordProcessedEvent('remote-2', 1_000_000_001);

    const snapshot = await buildSnapshot(store, { createdAt: 1_000_000_100 });

    expect(snapshot.coveredEvents).toEqual([
      { eventId: 'remote-1', timestamp: 1_000_000_000 },
      { eventId: 'remote-2', timestamp: 1_000_000_001 },
    ]);
  });

  it('coveredEvents includes local expense and category events with timestamps', async () => {
    await store.appendEvent(expenseEvent('local-exp', 'x1', 1_000_000_000));
    await store.appendCategoryEvent(
      categoryEvent('local-cat', 'c1', 1_000_000_001),
    );

    const snapshot = await buildSnapshot(store, { createdAt: 1_000_000_100 });

    expect([...snapshot.coveredEvents].sort((a, b) =>
      a.eventId < b.eventId ? -1 : 1,
    )).toEqual([
      { eventId: 'local-cat', timestamp: 1_000_000_001 },
      { eventId: 'local-exp', timestamp: 1_000_000_000 },
    ]);
  });

  it('coveredEvents de-duplicates across processed + local sources', async () => {
    // Same eventId appears in both processed_events (remote applied) and
    // the local event log (e.g., test seed or migration) — must surface
    // once.
    await store.recordProcessedEvent('shared', 1_000_000_000);
    await store.appendEvent(expenseEvent('shared', 'x1', 1_000_000_000));

    const snapshot = await buildSnapshot(store, { createdAt: 1_000_000_100 });

    expect(snapshot.coveredEvents).toEqual([
      { eventId: 'shared', timestamp: 1_000_000_000 },
    ]);
  });

  it('coveredEvents is sorted by eventId for stable output bytes', async () => {
    await store.recordProcessedEvent('zzz', 1_000_000_000);
    await store.recordProcessedEvent('aaa', 1_000_000_001);
    await store.recordProcessedEvent('mmm', 1_000_000_002);

    const snapshot = await buildSnapshot(store, { createdAt: 1_000_000_100 });

    expect(snapshot.coveredEvents.map((c) => c.eventId)).toEqual([
      'aaa',
      'mmm',
      'zzz',
    ]);
  });

  it('prunes coveredEvents entries older than the 30-day retention window', async () => {
    const createdAt = 100 * 24 * 60 * 60 * 1000; // 100 days in ms.
    const recent = createdAt - 5 * 24 * 60 * 60 * 1000; // 5 days ago.
    const ancient = createdAt - 60 * 24 * 60 * 60 * 1000; // 60 days ago.

    await store.recordProcessedEvent('keep-me', recent);
    await store.recordProcessedEvent('drop-me', ancient);
    await store.appendEvent(expenseEvent('keep-local', 'x1', recent));
    await store.appendEvent(expenseEvent('drop-local', 'x2', ancient));

    const snapshot = await buildSnapshot(store, { createdAt });

    expect(snapshot.coveredEvents.map((c) => c.eventId).sort()).toEqual([
      'keep-local',
      'keep-me',
    ]);
  });

  it('stamps the configured SNAPSHOT_VERSION', async () => {
    const snapshot = await buildSnapshot(store, { createdAt: 0 });
    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
  });
});
