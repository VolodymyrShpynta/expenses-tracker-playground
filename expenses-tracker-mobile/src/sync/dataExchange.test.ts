/**
 * Data-exchange tests — covers the file-based "export / restore from
 * sync" flow that lives behind the `useExportData` / `useImportData`
 * hooks.
 *
 * Restores rely on the same idempotent applier pipeline that the cloud
 * sync uses, so these scenarios mirror the user-visible promises:
 *   - Exporting then importing the same bytes is a no-op.
 *   - Importing a file from another device merges its events in.
 *   - Re-importing the same file is safe (idempotent).
 *   - Gzip-compressed files are auto-detected on import.
 *   - DELETED events propagate through a restore.
 *   - Categories are restored BEFORE expenses (foreign-key ordering).
 *   - A bad event in the file does not abort the whole restore.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyImportedBytes,
  buildExportFile,
  isGzipped,
} from './dataExchange';
import { decodeSyncFile, encodeSyncFile } from './codec';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { createCategoryService } from '../domain/categoryService';
import { createExpenseCommandService, type IdGenerator } from '../domain/commands';
import {
  DEFAULT_CATEGORY_TEMPLATES,
  defaultTemplateId,
} from '../domain/defaultCategories';
import { sequenceIds, sequenceTime } from '../test/fixtures';
import type { TimeProvider } from '../utils/time';
import type {
  CategoryEvent,
  EventSyncFile,
  ExpenseEvent,
} from '../domain/types';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function expenseEvent(
  overrides: Partial<ExpenseEvent> & {
    eventId: string;
    expenseId: string;
    timestamp: number;
  },
): ExpenseEvent {
  const payload = JSON.stringify({
    id: overrides.expenseId,
    amount: 1000,
    currency: 'USD',
    updatedAt: overrides.timestamp,
    deleted: false,
  });
  return {
    eventType: 'CREATED',
    payload,
    committed: false,
    ...overrides,
  };
}

function categoryEvent(
  overrides: Partial<CategoryEvent> & {
    eventId: string;
    categoryId: string;
    timestamp: number;
  },
): CategoryEvent {
  const payload = JSON.stringify({
    id: overrides.categoryId,
    name: 'Food',
    icon: 'food',
    color: '#FF0000',
    sortOrder: 0,
    updatedAt: overrides.timestamp,
    deleted: false,
  });
  return {
    eventType: 'CREATED',
    payload,
    committed: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isGzipped
// ---------------------------------------------------------------------------

describe('isGzipped', () => {
  it('returns true for the gzip magic-byte prefix', () => {
    expect(isGzipped(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]))).toBe(true);
  });

  it('returns false for plain JSON bytes', () => {
    expect(isGzipped(new TextEncoder().encode('{"events":[]}'))).toBe(false);
  });

  it('returns false for inputs shorter than 2 bytes', () => {
    expect(isGzipped(new Uint8Array([]))).toBe(false);
    expect(isGzipped(new Uint8Array([0x1f]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildExportFile
// ---------------------------------------------------------------------------

describe('buildExportFile', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    store = new InMemoryLocalStore();
  });

  it('exports zero counts and a round-trippable empty file from an empty store', async () => {
    // Given: An empty store
    // When: Building the export
    const payload = await buildExportFile(store);

    // Then: Counts are zero, but the bytes still decode to an empty file
    expect(payload.eventCount).toBe(0);
    expect(payload.categoryEventCount).toBe(0);
    const decoded = decodeSyncFile(payload.bytes, false);
    expect(decoded.events).toEqual([]);
    expect(decoded.categoryEvents).toEqual([]);
  });

  it('exports both committed and uncommitted events', async () => {
    // Given: One uncommitted event and one already-committed event
    await store.appendEvent(expenseEvent({ eventId: 'e-uncommitted', expenseId: 'x1', timestamp: 100 }));
    await store.appendEvent(expenseEvent({ eventId: 'e-committed', expenseId: 'x2', timestamp: 200 }));
    await store.markEventsCommitted(['e-committed']);

    // When
    const payload = await buildExportFile(store);

    // Then: Both events are included — export is the FULL history.
    expect(payload.eventCount).toBe(2);
    const decoded = decodeSyncFile(payload.bytes, false);
    expect(decoded.events.map((e) => e.eventId).sort()).toEqual([
      'e-committed',
      'e-uncommitted',
    ]);
  });

  it('exports events sorted by timestamp ASC (deterministic order)', async () => {
    // Given: Events appended out of order
    await store.appendEvent(expenseEvent({ eventId: 'e-late', expenseId: 'x1', timestamp: 300 }));
    await store.appendEvent(expenseEvent({ eventId: 'e-early', expenseId: 'x2', timestamp: 100 }));
    await store.appendEvent(expenseEvent({ eventId: 'e-mid', expenseId: 'x3', timestamp: 200 }));

    // When
    const payload = await buildExportFile(store);

    // Then
    const decoded = decodeSyncFile(payload.bytes, false);
    expect(decoded.events.map((e) => e.eventId)).toEqual(['e-early', 'e-mid', 'e-late']);
  });

  it('exports both expense and category event logs together', async () => {
    await store.appendEvent(expenseEvent({ eventId: 'e1', expenseId: 'x1', timestamp: 100 }));
    await store.appendCategoryEvent(categoryEvent({ eventId: 'ce1', categoryId: 'c1', timestamp: 50 }));

    const payload = await buildExportFile(store);

    expect(payload.eventCount).toBe(1);
    expect(payload.categoryEventCount).toBe(1);
    const decoded = decodeSyncFile(payload.bytes, false);
    expect(decoded.events[0]?.eventId).toBe('e1');
    expect(decoded.categoryEvents[0]?.eventId).toBe('ce1');
  });

  it('parses event payloads back into objects (not JSON strings)', async () => {
    // Given: An event whose stored payload is a JSON string
    await store.appendEvent(expenseEvent({ eventId: 'e1', expenseId: 'x1', timestamp: 100 }));

    // When
    const payload = await buildExportFile(store);

    // Then: The wire format carries the payload as an object, not a string
    const decoded = decodeSyncFile(payload.bytes, false);
    expect(typeof decoded.events[0]?.payload).toBe('object');
    expect(decoded.events[0]?.payload.id).toBe('x1');
    expect(decoded.events[0]?.payload.amount).toBe(1000);
  });

  it('produces uncompressed bytes (so users can inspect the file)', async () => {
    await store.appendEvent(expenseEvent({ eventId: 'e1', expenseId: 'x1', timestamp: 100 }));

    const payload = await buildExportFile(store);

    expect(isGzipped(payload.bytes)).toBe(false);
    // First byte must be '{' — readable JSON.
    expect(payload.bytes[0]).toBe('{'.charCodeAt(0));
  });
});

// ---------------------------------------------------------------------------
// applyImportedBytes — restore-from-sync
// ---------------------------------------------------------------------------

describe('applyImportedBytes', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    store = new InMemoryLocalStore();
  });

  it('restores events from an exported file into an empty store', async () => {
    // Given: A "source" store and an exported file
    const source = new InMemoryLocalStore();
    await source.appendEvent(expenseEvent({ eventId: 'e1', expenseId: 'x1', timestamp: 100 }));
    await source.appendCategoryEvent(categoryEvent({ eventId: 'ce1', categoryId: 'c1', timestamp: 50 }));
    const { bytes } = await buildExportFile(source);

    // When: Importing into a fresh store
    const result = await applyImportedBytes(store, bytes);

    // Then: Both events are applied
    expect(result.applied).toBe(2); // 1 expense + 1 category
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(await store.findProjectionById('x1')).toBeDefined();
    expect(await store.findCategoryById('c1')).toBeDefined();
  });

  it('is idempotent — re-importing the same file is a no-op', async () => {
    // Given: A file with one expense and one category event
    const source = new InMemoryLocalStore();
    await source.appendEvent(expenseEvent({ eventId: 'e1', expenseId: 'x1', timestamp: 100 }));
    await source.appendCategoryEvent(categoryEvent({ eventId: 'ce1', categoryId: 'c1', timestamp: 50 }));
    const { bytes } = await buildExportFile(source);

    await applyImportedBytes(store, bytes);

    // When: Re-importing
    const second = await applyImportedBytes(store, bytes);

    // Then: Every event is skipped via processed_events
    expect(second.applied).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.errors).toBe(0);
  });

  it('round-trips: export from device A, restore into device B', async () => {
    // Given: Device A has both expense and category history
    const deviceA = new InMemoryLocalStore();
    await deviceA.appendCategoryEvent(categoryEvent({ eventId: 'ce1', categoryId: 'cat-food', timestamp: 100 }));
    await deviceA.appendEvent(expenseEvent({ eventId: 'e1', expenseId: 'exp-1', timestamp: 200 }));
    await deviceA.appendEvent(expenseEvent({ eventId: 'e2', expenseId: 'exp-2', timestamp: 300 }));

    // When: Export from A and import into B
    const { bytes } = await buildExportFile(deviceA);
    const result = await applyImportedBytes(store, bytes);

    // Then: B's projections match the events restored from A
    expect(result.applied).toBe(3);
    expect(await store.findProjectionById('exp-1')).toBeDefined();
    expect(await store.findProjectionById('exp-2')).toBeDefined();
    expect(await store.findCategoryById('cat-food')).toBeDefined();
  });

  it('merges two devices via export → import', async () => {
    // Given: Device A and Device B each have distinct events (appended +
    // projected, mirroring what the command service does locally)
    const deviceA = new InMemoryLocalStore();
    await deviceA.appendEvent(expenseEvent({ eventId: 'eA', expenseId: 'xA', timestamp: 100 }));
    await deviceA.projectFromEvent({
      id: 'xA',
      amount: 1000,
      currency: 'USD',
      updatedAt: 100,
      deleted: false,
    });

    const deviceB = new InMemoryLocalStore();
    await deviceB.appendEvent(expenseEvent({ eventId: 'eB', expenseId: 'xB', timestamp: 200 }));
    await deviceB.projectFromEvent({
      id: 'xB',
      amount: 1000,
      currency: 'USD',
      updatedAt: 200,
      deleted: false,
    });

    // When: Each device imports the other's export
    const aBytes = (await buildExportFile(deviceA)).bytes;
    const bBytes = (await buildExportFile(deviceB)).bytes;
    await applyImportedBytes(deviceA, bBytes);
    await applyImportedBytes(deviceB, aBytes);

    // Then: Both devices end up with both expenses
    expect((await deviceA.findActiveProjections()).map((p) => p.id).sort()).toEqual([
      'xA',
      'xB',
    ]);
    expect((await deviceB.findActiveProjections()).map((p) => p.id).sort()).toEqual([
      'xA',
      'xB',
    ]);
  });

  it('auto-detects and decompresses a gzipped file', async () => {
    // Given: A file encoded with gzip
    const file: EventSyncFile = {
      events: [
        {
          eventId: 'e1',
          timestamp: 100,
          eventType: 'CREATED',
          expenseId: 'x1',
          payload: {
            id: 'x1',
            amount: 1000,
            currency: 'USD',
            updatedAt: 100,
            deleted: false,
          },
        },
      ],
      categoryEvents: [],
    };
    const gzipped = encodeSyncFile(file, true);
    expect(isGzipped(gzipped)).toBe(true);

    // When
    const result = await applyImportedBytes(store, gzipped);

    // Then: Decoded transparently — caller never had to pick the format
    expect(result.applied).toBe(1);
    expect(await store.findProjectionById('x1')).toBeDefined();
  });

  it('propagates DELETED events on restore (soft-deleted on the target)', async () => {
    // Given: Source has an expense with both a CREATED and a later DELETED event
    const source = new InMemoryLocalStore();
    await source.appendEvent({
      eventId: 'e-create',
      timestamp: 100,
      eventType: 'CREATED',
      expenseId: 'x1',
      payload: JSON.stringify({
        id: 'x1',
        amount: 1000,
        currency: 'USD',
        updatedAt: 100,
        deleted: false,
      }),
      committed: false,
    });
    await source.appendEvent({
      eventId: 'e-delete',
      timestamp: 200,
      eventType: 'DELETED',
      expenseId: 'x1',
      payload: JSON.stringify({
        id: 'x1',
        amount: 1000,
        currency: 'USD',
        updatedAt: 200,
        deleted: true,
      }),
      committed: false,
    });
    const { bytes } = await buildExportFile(source);

    // When
    await applyImportedBytes(store, bytes);

    // Then: Row exists but is soft-deleted; not visible to active queries.
    const row = await store.findProjectionById('x1');
    expect(row?.deleted).toBe(true);
    expect(await store.findActiveProjections()).toHaveLength(0);
  });

  it('applies categories before expenses (so referencing rows project cleanly)', async () => {
    // Given: A file whose category event is sorted AFTER the expense by id.
    // The applier still has to process categories first.
    const source = new InMemoryLocalStore();
    await source.appendEvent(
      expenseEvent({ eventId: 'a-expense', expenseId: 'x1', timestamp: 200 }),
    );
    await source.appendCategoryEvent(
      categoryEvent({ eventId: 'z-category', categoryId: 'c-late', timestamp: 100 }),
    );
    const { bytes } = await buildExportFile(source);

    // Track invocation order on the target store.
    const order: string[] = [];
    const origCat = store.projectCategoryFromEvent.bind(store);
    store.projectCategoryFromEvent = async (c) => {
      order.push('category');
      return origCat(c);
    };
    const origExp = store.projectFromEvent.bind(store);
    store.projectFromEvent = async (p) => {
      order.push('expense');
      return origExp(p);
    };

    // When
    await applyImportedBytes(store, bytes);

    // Then: All category projections happen before any expense projection
    const firstExpenseIdx = order.indexOf('expense');
    const lastCategoryIdx = order.lastIndexOf('category');
    expect(firstExpenseIdx).toBeGreaterThan(lastCategoryIdx);
  });

  it('imports an empty exported file as a no-op', async () => {
    const source = new InMemoryLocalStore();
    const { bytes } = await buildExportFile(source);

    const result = await applyImportedBytes(store, bytes);

    expect(result).toEqual({ applied: 0, skipped: 0, errors: 0 });
  });

  it('isolates per-event failures — one bad event does not abort the restore', async () => {
    // Given: Two valid + one event whose projection-write will throw
    const source = new InMemoryLocalStore();
    await source.appendEvent(expenseEvent({ eventId: 'e-ok-1', expenseId: 'good-1', timestamp: 100 }));
    await source.appendEvent(expenseEvent({ eventId: 'e-bad', expenseId: 'fail', timestamp: 200 }));
    await source.appendEvent(expenseEvent({ eventId: 'e-ok-2', expenseId: 'good-2', timestamp: 300 }));
    const { bytes } = await buildExportFile(source);

    // Stub the target store so any expense with id 'fail' throws on project.
    const original = store.projectFromEvent.bind(store);
    store.projectFromEvent = async (p) => {
      if (p.id === 'fail') throw new Error('boom');
      return original(p);
    };

    // When
    const result = await applyImportedBytes(store, bytes);

    // Then: Two applied, one errored — the good events are still in.
    expect(result.applied).toBe(2);
    expect(result.errors).toBe(1);
    expect(await store.findProjectionById('good-1')).toBeDefined();
    expect(await store.findProjectionById('good-2')).toBeDefined();
    expect(await store.findProjectionById('fail')).toBeUndefined();
  });

  it('records imported events in the idempotency registry', async () => {
    const source = new InMemoryLocalStore();
    await source.appendEvent(expenseEvent({ eventId: 'e1', expenseId: 'x1', timestamp: 100 }));
    await source.appendCategoryEvent(categoryEvent({ eventId: 'ce1', categoryId: 'c1', timestamp: 50 }));
    const { bytes } = await buildExportFile(source);

    await applyImportedBytes(store, bytes);

    expect(await store.isEventProcessed('e1')).toBe(true);
    expect(await store.isEventProcessed('ce1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Default-template seed sync — regression coverage
// ---------------------------------------------------------------------------
//
// Two fresh devices both seed the same set of default category templates
// on first launch. They each emit their own `CREATED` event for, say,
// the `food` template. When device A exports and device B imports (or
// vice-versa), the incoming `CREATED` events must converge onto B's
// existing seed rows. The seed ids are derived deterministically from
// `template_key` (see `defaultTemplateId`) for exactly that reason —
// random per-device UUIDs would create id collisions on the unique
// `template_key` index.

describe('default-template seed sync (two-device regression)', () => {
  /**
   * Seed the default templates on a fresh `InMemoryLocalStore` using the
   * real `categoryService`. `timeStart` controls the LWW timestamp so the
   * two devices can be ordered against each other in tests.
   */
  async function seedDefaultsOn(timeStart: number): Promise<InMemoryLocalStore> {
    const store = new InMemoryLocalStore();
    const count = DEFAULT_CATEGORY_TEMPLATES.length;
    // Each template consumes one id (the eventId) and two timestamp ticks
    // (buildPayload `updatedAt`, then `appendCategoryEventInTx` timestamp).
    const ids = Array.from({ length: count }, (_, i) => `evt-${timeStart}-${i}`);
    const times = Array.from({ length: count * 2 }, (_, i) => timeStart + i);
    const service = createCategoryService({
      store,
      time: sequenceTime(times),
      ids: sequenceIds(ids),
    });
    const seeded = await service.seedDefaultsIfEmpty();
    expect(seeded).toBe(count);
    return store;
  }

  it('does not raise UNIQUE constraint failures when two devices import each other', async () => {
    // Given: Two devices that both seeded the default templates locally
    const deviceA = await seedDefaultsOn(1_000);
    const deviceB = await seedDefaultsOn(5_000);

    // And: Their seed rows share template ids derived from `template_key`
    const aFood = (await deviceA.findAllCategories()).find(
      (c) => c.templateKey === 'food',
    );
    const bFood = (await deviceB.findAllCategories()).find(
      (c) => c.templateKey === 'food',
    );
    expect(aFood?.id).toBeDefined();
    expect(aFood?.id).toBe(bFood?.id);

    // When: Each device imports the other's export
    const { bytes: aBytes } = await buildExportFile(deviceA);
    const { bytes: bBytes } = await buildExportFile(deviceB);
    const aResult = await applyImportedBytes(deviceA, bBytes);
    const bResult = await applyImportedBytes(deviceB, aBytes);

    // Then: Every event applies cleanly — no constraint violations
    expect(aResult.errors).toBe(0);
    expect(bResult.errors).toBe(0);

    // And: Both devices still have exactly one row per template
    const aCount = (await deviceA.findAllCategories()).filter(
      (c) => c.templateKey !== undefined,
    ).length;
    const bCount = (await deviceB.findAllCategories()).filter(
      (c) => c.templateKey !== undefined,
    ).length;
    expect(aCount).toBe(DEFAULT_CATEGORY_TEMPLATES.length);
    expect(bCount).toBe(DEFAULT_CATEGORY_TEMPLATES.length);
  });

  it('keeps the newer LWW version when devices disagree on template metadata', async () => {
    // Given: Device A seeded first; device B seeded later (newer updatedAt)
    const deviceA = await seedDefaultsOn(1_000);
    const deviceB = await seedDefaultsOn(5_000);

    // When: A imports B's events (B is strictly newer)
    const { bytes } = await buildExportFile(deviceB);
    const result = await applyImportedBytes(deviceA, bytes);

    // Then: All events are recorded (no errors), and A's rows reflect B's
    // newer `updated_at` thanks to last-write-wins.
    expect(result.errors).toBe(0);
    const aFood = (await deviceA.findAllCategories()).find(
      (c) => c.templateKey === 'food',
    );
    const bFood = (await deviceB.findAllCategories()).find(
      (c) => c.templateKey === 'food',
    );
    expect(aFood?.updatedAt).toBe(bFood?.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// User scenario — rename a default category on a fresh device, then sync
// ---------------------------------------------------------------------------
//
// Reproduces the end-to-end flow:
//   1. Device A is wiped, boots, seeds defaults, creates three expenses
//      against `food`, then syncs.
//   2. Device B is wiped, boots, seeds defaults, renames `food` to
//      "Groceries" with a new icon, and creates one expense against
//      `food`.
//   3. Devices sync: B sees A's three expenses (under the renamed
//      category), A sees the rename and B's new expense.
//
// Without deterministic template ids, A's `food` row and B's `food` row
// would carry different UUIDs — A's expenses would land orphaned and the
// shared seed CREATED events would hit UNIQUE(`template_key`).

describe('user scenario — rename + sync converges to the same view on both devices', () => {
  /**
   * Monotonically-incrementing time provider. Each `nowMs()` returns the
   * next integer starting at `start`. Used to build realistic event
   * timestamps without hand-counting ticks.
   */
  function monotonicTime(start: number): TimeProvider {
    let t = start;
    return { nowMs: () => t++ };
  }

  /** Generates `${prefix}-0`, `${prefix}-1`, ... ids on demand. */
  function sequentialIds(prefix: string): IdGenerator {
    let n = 0;
    return { newUuid: () => `${prefix}-${n++}` };
  }

  it('renamed category and synced expenses converge on both devices', async () => {
    const foodId = defaultTemplateId('food');

    // --- Device A: seed defaults + create three `food` expenses --------
    const deviceA = new InMemoryLocalStore();
    const categoriesA = createCategoryService({
      store: deviceA,
      time: monotonicTime(1_000_000),
      ids: sequentialIds('A-cat'),
    });
    const expensesA = createExpenseCommandService({
      store: deviceA,
      time: monotonicTime(1_500_000),
      ids: sequentialIds('A-exp'),
    });
    await categoriesA.seedDefaultsIfEmpty();
    await expensesA.createExpense({
      description: 'Coffee',
      amount: 350,
      currency: 'USD',
      categoryId: foodId,
      date: '2026-05-13',
    });
    await expensesA.createExpense({
      description: 'Lunch',
      amount: 1200,
      currency: 'USD',
      categoryId: foodId,
      date: '2026-05-13',
    });
    await expensesA.createExpense({
      description: 'Snacks',
      amount: 450,
      currency: 'USD',
      categoryId: foodId,
      date: '2026-05-13',
    });

    // --- Device B: seed defaults + rename `food` + new expense ---------
    // B's clock is strictly after A's so B's rename is the newest event.
    const deviceB = new InMemoryLocalStore();
    const categoriesB = createCategoryService({
      store: deviceB,
      time: monotonicTime(3_000_000),
      ids: sequentialIds('B-cat'),
    });
    const expensesB = createExpenseCommandService({
      store: deviceB,
      time: monotonicTime(3_500_000),
      ids: sequentialIds('B-exp'),
    });
    await categoriesB.seedDefaultsIfEmpty();
    const renamed = await categoriesB.updateCategory(foodId, {
      name: 'Groceries',
      icon: 'ShoppingBasket',
      color: '#4caf50',
    });
    expect(renamed?.name).toBe('Groceries');
    await expensesB.createExpense({
      description: 'Farmers market',
      amount: 2200,
      currency: 'USD',
      categoryId: foodId,
      date: '2026-05-14',
    });

    // --- Sync: A → B then B → A (full convergence) --------------------
    const aBytes = (await buildExportFile(deviceA)).bytes;
    const bBytes = (await buildExportFile(deviceB)).bytes;
    const aIntoB = await applyImportedBytes(deviceB, aBytes);
    const bIntoA = await applyImportedBytes(deviceA, bBytes);
    expect(aIntoB.errors).toBe(0);
    expect(bIntoA.errors).toBe(0);

    // --- Then: Both devices show the rename + all four expenses -------
    for (const [label, device] of [
      ['A', deviceA],
      ['B', deviceB],
    ] as const) {
      const food = await device.findCategoryById(foodId);
      expect(food, `${label}.food row`).toBeDefined();
      expect(food?.name, `${label}.food.name`).toBe('Groceries');
      expect(food?.icon, `${label}.food.icon`).toBe('ShoppingBasket');
      expect(food?.deleted, `${label}.food.deleted`).toBe(false);

      const projections = await device.findActiveProjections();
      expect(projections, `${label}.activeProjections`).toHaveLength(4);
      expect(
        projections.every((p) => p.categoryId === foodId),
        `${label}.allReferenceFood`,
      ).toBe(true);

      const descriptions = projections.map((p) => p.description).sort();
      expect(descriptions, `${label}.descriptions`).toEqual([
        'Coffee',
        'Farmers market',
        'Lunch',
        'Snacks',
      ]);
    }

    // --- And: The full default catalog is present on both -------------
    const expectedTemplateCount = DEFAULT_CATEGORY_TEMPLATES.length;
    for (const [label, device] of [
      ['A', deviceA],
      ['B', deviceB],
    ] as const) {
      const templateRows = (await device.findAllCategories()).filter(
        (c) => c.templateKey !== undefined && !c.deleted,
      );
      expect(templateRows, `${label}.templateCount`).toHaveLength(
        expectedTemplateCount,
      );
    }
  });
});
