/**
 * Snapshot apply tests — verifies that `applySnapshot` bulk-loads
 * projections, categories, and the covered-event registry with strict
 * LWW semantics, mirroring `applyRemoteEvents` correctness invariants.
 *
 * Covers:
 *   - Empty snapshot is a no-op.
 *   - Populated snapshot inserts everything on a cold install.
 *   - LWW: newer local rows win over older snapshot rows.
 *   - Soft-deleted snapshot rows survive (resurrection still possible
 *     via a later event).
 *   - `coveredEvents` is bulk-marked as processed.
 *   - Re-applying the same snapshot is idempotent.
 *   - Unsupported `version` throws `IncompatibleSnapshotError`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { applySnapshot, IncompatibleSnapshotError } from './snapshotApply';
import { SNAPSHOT_VERSION } from './snapshotBuilder';
import type {
  Category,
  CoveredEvent,
  ExpenseProjection,
  SyncFileSnapshot,
} from '../domain/types';

const silentLogger = { warn: () => undefined };

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

const snapshotOf = (
  fields: Partial<SyncFileSnapshot> = {},
): SyncFileSnapshot => ({
  version: SNAPSHOT_VERSION,
  createdAt: 1000,
  expenses: [],
  categories: [],
  coveredEvents: [],
  ...fields,
});

const covered = (...ids: string[]): ReadonlyArray<CoveredEvent> =>
  ids.map((eventId) => ({ eventId, timestamp: 0 }));

describe('applySnapshot', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    store = new InMemoryLocalStore();
  });

  it('is a no-op for an empty snapshot', async () => {
    const result = await applySnapshot(store, snapshotOf(), silentLogger);

    expect(result).toEqual({
      projectionsApplied: 0,
      categoriesApplied: 0,
      eventsMarked: 0,
    });
  });

  it('bulk-inserts projections, categories, and processed events', async () => {
    const snapshot = snapshotOf({
      expenses: [projection('e1', 100), projection('e2', 200)],
      categories: [category('c1', 100), category('c2', 200)],
      coveredEvents: covered('ev-1', 'ev-2', 'ev-3'),
    });

    const result = await applySnapshot(store, snapshot, silentLogger);

    expect(result).toEqual({
      projectionsApplied: 2,
      categoriesApplied: 2,
      eventsMarked: 3,
    });
    expect(store.allProjections().length).toBe(2);
    expect(store.allCategories().length).toBe(2);
    expect(await store.isEventProcessed('ev-1')).toBe(true);
    expect(await store.isEventProcessed('ev-2')).toBe(true);
    expect(await store.isEventProcessed('ev-3')).toBe(true);
  });

  it('preserves soft-deleted projection rows from the snapshot', async () => {
    const snapshot = snapshotOf({
      expenses: [projection('e1', 100, true)],
    });
    await applySnapshot(store, snapshot, silentLogger);

    const row = await store.findProjectionById('e1');
    expect(row?.deleted).toBe(true);
  });

  it('respects LWW — local newer row beats snapshot older row', async () => {
    // Local already has the row at updatedAt=200.
    await store.projectFromEvent(projection('e1', 200));
    const snapshot = snapshotOf({
      // Snapshot tries to apply an older state at updatedAt=100.
      expenses: [projection('e1', 100)],
    });

    const result = await applySnapshot(store, snapshot, silentLogger);

    // 0 projections applied — local row wins.
    expect(result.projectionsApplied).toBe(0);
    const row = await store.findProjectionById('e1');
    expect(row?.updatedAt).toBe(200);
  });

  it('respects LWW — snapshot newer row overwrites local older row', async () => {
    await store.projectFromEvent(projection('e1', 100));
    const snapshot = snapshotOf({
      expenses: [projection('e1', 200)],
    });

    const result = await applySnapshot(store, snapshot, silentLogger);

    expect(result.projectionsApplied).toBe(1);
    const row = await store.findProjectionById('e1');
    expect(row?.updatedAt).toBe(200);
  });

  it('is idempotent — re-applying the same snapshot produces no changes', async () => {
    const snapshot = snapshotOf({
      expenses: [projection('e1', 100)],
      categories: [category('c1', 100)],
      coveredEvents: covered('ev-1'),
    });

    await applySnapshot(store, snapshot, silentLogger);
    const second = await applySnapshot(store, snapshot, silentLogger);

    expect(second).toEqual({
      // Same updatedAt → strict `>` fails → 0 applied.
      projectionsApplied: 0,
      categoriesApplied: 0,
      // Already in processed_events → 0 new inserts.
      eventsMarked: 0,
    });
  });

  it('refuses snapshots with an unsupported version', async () => {
    const unsupported: SyncFileSnapshot = {
      version: 999,
      createdAt: 1000,
      expenses: [projection('e1', 100)],
      categories: [category('c1', 100)],
      coveredEvents: covered('ev-1'),
    };

    const warnings: string[] = [];
    await expect(
      applySnapshot(store, unsupported, {
        warn: (msg) => warnings.push(String(msg)),
      }),
    ).rejects.toBeInstanceOf(IncompatibleSnapshotError);

    expect(warnings).toHaveLength(1);
    // Confirm nothing was applied before the throw.
    expect(store.allProjections()).toHaveLength(0);
    expect(store.allCategories()).toHaveLength(0);
    expect(await store.isEventProcessed('ev-1')).toBe(false);
  });

  it('IncompatibleSnapshotError carries received and expected versions', async () => {
    const unsupported: SyncFileSnapshot = {
      version: 999,
      createdAt: 1000,
      expenses: [],
      categories: [],
      coveredEvents: [],
    };

    try {
      await applySnapshot(store, unsupported, silentLogger);
      throw new Error('expected applySnapshot to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(IncompatibleSnapshotError);
      const err = e as IncompatibleSnapshotError;
      expect(err.received).toBe(999);
      expect(err.expected).toBe(SNAPSHOT_VERSION);
      expect(err.message).toContain('999');
      expect(err.message).toContain(String(SNAPSHOT_VERSION));
    }
  });

  it('only counts NEW processed-event inserts (already-present IDs do not double-count)', async () => {
    // Pre-mark one of the IDs.
    await store.recordProcessedEvent('ev-1', 0);
    const snapshot = snapshotOf({ coveredEvents: covered('ev-1', 'ev-2') });

    const result = await applySnapshot(store, snapshot, silentLogger);

    expect(result.eventsMarked).toBe(1);
    expect(await store.isEventProcessed('ev-2')).toBe(true);
  });
});
