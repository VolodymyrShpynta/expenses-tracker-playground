/**
 * Category service tests — mirrors `commands.test.ts` but for the
 * category aggregate. Verifies that every mutation appends the correct
 * event type and projects the row inside a single transaction.
 *
 * Scope: command-side behaviour only. The remote-apply path (LWW,
 * idempotency) is covered by `sync/remoteCategoryEventApplier.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { createCategoryService, type CategoryService } from './categoryService';
import { createExpenseCommandService } from './commands';
import {
  DEFAULT_CATEGORY_TEMPLATES,
  defaultTemplateId,
} from './defaultCategories';
import type { LocalStore } from './localStore';
import type { CategoryPayload, EventType } from './types';
import { applyRemoteCategoryEvents } from '../sync/remoteCategoryEventApplier';
import { createTestStore } from '../test/sqliteTestStore';
import { createQueuedLocalStore } from '../test/queuedLocalStore';
import { sequenceIds, sequenceTime } from '../test/fixtures';

const silentLogger = { warn: () => undefined };

function buildService(opts: { ids: string[]; times: number[] }) {
  const store = createTestStore();
  const service = createCategoryService({
    store,
    time: sequenceTime(opts.times),
    ids: sequenceIds(opts.ids),
  });
  return { store, service };
}

describe('CategoryService — createCategory', () => {
  it('should append a CREATED event and project the row atomically', async () => {
    // Given: a fresh store with deterministic ids/time
    // ids: [categoryId, eventId]
    // times: [buildPayload's updatedAt, appendCategoryEventInTx's timestamp]
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1'],
      times: [1000, 1001],
    });

    // When: creating a new category
    const created = await service.createCategory({
      name: 'Coffee',
      icon: 'coffee',
      color: '#A0522D',
      sortOrder: 5,
    });

    // Then: the returned row reflects the input
    expect(created.id).toBe('cat-1');
    expect(created.name).toBe('Coffee');
    expect(created.icon).toBe('coffee');
    expect(created.color).toBe('#A0522D');
    expect(created.sortOrder).toBe(5);
    expect(created.deleted).toBe(false);
    expect(created.updatedAt).toBe(1000);

    // And: one CREATED event was appended
    const events = store.allCategoryEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('CREATED');
    expect(events[0]?.eventId).toBe('evt-1');
    expect(events[0]?.categoryId).toBe('cat-1');
    expect(events[0]?.committed).toBe(false);

    // And: the row is projected
    const stored = await store.findCategoryById('cat-1');
    expect(stored?.name).toBe('Coffee');
  });

  it('should serialize the payload to JSON inside the event', async () => {
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1'],
      times: [1000, 1001],
    });

    await service.createCategory({ name: 'Coffee', icon: 'coffee', color: '#000' });

    const event = store.allCategoryEvents()[0]!;
    const parsed = JSON.parse(event.payload) as Record<string, unknown>;
    expect(parsed.id).toBe('cat-1');
    expect(parsed.name).toBe('Coffee');
    expect(parsed.deleted).toBe(false);
  });

  it('should default sortOrder to 0 when omitted', async () => {
    const { service } = buildService({
      ids: ['cat-1', 'evt-1'],
      times: [1000, 1001],
    });

    const created = await service.createCategory({
      name: 'Coffee',
      icon: 'coffee',
      color: '#000',
    });
    expect(created.sortOrder).toBe(0);
  });
});

describe('CategoryService — updateCategory', () => {
  it('should roll back the event when a rename collides with another active category', async () => {
    // Given: two active categories
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1', 'cat-2', 'evt-2', 'evt-3'],
      times: [1000, 1001, 2000, 2001, 3000, 3001],
    });
    await service.createCategory({ name: 'Coffee', icon: 'coffee', color: '#000' });
    const tea = await service.createCategory({ name: 'Tea', icon: 'tea', color: '#000' });
    const eventsBefore = store.allCategoryEvents().length;

    // When / Then: the unique index on active names rejects the rename
    await expect(service.updateCategory(tea.id, { name: 'Coffee' }))
      .rejects.toThrow(/UNIQUE constraint failed: categories\.name/);

    // And: the UPDATED event rolled back with the projection
    expect(store.allCategoryEvents()).toHaveLength(eventsBefore);
    expect((await store.findCategoryById(tea.id))?.name).toBe('Tea');
  });

  it('should return undefined when updating a non-existent category', async () => {
    const { service } = buildService({ ids: [], times: [] });
    const result = await service.updateCategory('does-not-exist', { name: 'New' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when updating a soft-deleted category', async () => {
    // Given: a category that has been soft-deleted
    const { service } = buildService({
      ids: ['cat-1', 'evt-1', 'evt-2'],
      times: [1000, 1001, 2000, 2001],
    });
    await service.createCategory({ name: 'Old', icon: 'i', color: '#fff' });
    await service.deleteCategory('cat-1');

    // When/Then
    const result = await service.updateCategory('cat-1', { name: 'New' });
    expect(result).toBeUndefined();
  });

  it('should append an UPDATED event and merge into the projection', async () => {
    // Given: an existing category
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1', 'evt-2'],
      times: [1000, 1001, 2000, 2001],
    });
    await service.createCategory({
      name: 'Old',
      icon: 'old-icon',
      color: '#000',
      sortOrder: 0,
    });

    // When: updating just the name
    const updated = await service.updateCategory('cat-1', { name: 'New' });

    // Then: only the name changed; other fields preserved
    expect(updated?.name).toBe('New');
    expect(updated?.icon).toBe('old-icon');
    expect(updated?.color).toBe('#000');
    expect(updated?.updatedAt).toBe(2000);

    // And: two events were appended (CREATED + UPDATED)
    const events = store.allCategoryEvents();
    expect(events).toHaveLength(2);
    expect(events[1]?.eventType).toBe('UPDATED');
  });

  it('should preserve `templateKey` when renaming a default-template row', async () => {
    // Given: a default-template row seeded with `templateKey = 'food'`
    // (mirrors what `seedDefaultsIfEmpty` produces for the user's scenario)
    const { store, service } = buildService({
      ids: Array.from({ length: 50 }, (_, i) => `id-${i}`),
      times: Array.from({ length: 50 }, (_, i) => 1000 + i),
    });
    await service.seedDefaultsIfEmpty();
    const foodId = defaultTemplateId('food');

    // When: the user renames the seeded template + changes its icon
    const renamed = await service.updateCategory(foodId, {
      name: 'Groceries',
      icon: 'ShoppingBasket',
    });

    // Then: the rename takes effect AND the template marker survives
    expect(renamed?.name).toBe('Groceries');
    expect(renamed?.icon).toBe('ShoppingBasket');
    expect(renamed?.templateKey).toBe('food');

    // And: the persisted UPDATED event carries the same `templateKey`
    // — critical for peers, which need it to keep this row aligned with
    // their own seed row id when LWW resolves the import.
    const stored = await store.findCategoryById(foodId);
    expect(stored?.templateKey).toBe('food');
    const updatedEvent = store.allCategoryEvents().find(
      (e) => e.categoryId === foodId && e.eventType === 'UPDATED',
    );
    expect(updatedEvent).toBeDefined();
    const payload = JSON.parse(updatedEvent!.payload) as Record<string, unknown>;
    expect(payload.templateKey).toBe('food');
    expect(payload.name).toBe('Groceries');
  });
});

describe('CategoryService — deleteCategory', () => {
  it('should append a DELETED event and soft-delete the row', async () => {
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1', 'evt-2'],
      times: [1000, 1001, 2000, 2001],
    });
    await service.createCategory({ name: 'X', icon: 'i', color: '#000' });

    const ok = await service.deleteCategory('cat-1');
    expect(ok).toBe(true);

    const events = store.allCategoryEvents();
    expect(events).toHaveLength(2);
    expect(events[1]?.eventType).toBe('DELETED');

    // The row stays in storage with deleted=true.
    const row = await store.findCategoryById('cat-1');
    expect(row?.deleted).toBe(true);
  });

  it('should embed the last-known payload in the DELETED event', async () => {
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1', 'evt-2'],
      times: [1000, 1001, 2000, 2001],
    });
    await service.createCategory({
      name: 'Coffee',
      icon: 'coffee',
      color: '#A0522D',
      sortOrder: 3,
    });

    await service.deleteCategory('cat-1');

    // Peers resolving the DELETE need every field present so the
    // soft-delete carries enough context to render the archived row.
    const deletedEvent = store.allCategoryEvents()[1]!;
    const parsed = JSON.parse(deletedEvent.payload) as Record<string, unknown>;
    expect(parsed.id).toBe('cat-1');
    expect(parsed.name).toBe('Coffee');
    expect(parsed.icon).toBe('coffee');
    expect(parsed.color).toBe('#A0522D');
    expect(parsed.sortOrder).toBe(3);
    expect(parsed.deleted).toBe(true);
  });

  it('should return false when the category is already deleted', async () => {
    const { service } = buildService({
      ids: ['cat-1', 'evt-1', 'evt-2'],
      times: [1000, 1001, 2000, 2001],
    });
    await service.createCategory({ name: 'X', icon: 'i', color: '#000' });
    await service.deleteCategory('cat-1');

    const second = await service.deleteCategory('cat-1');
    expect(second).toBe(false);
  });
});

describe('CategoryService — commands queued behind a sync batch', () => {
  // The command's wall clock. Peer events carry this exact stamp — the
  // tightest case the strict-`>` LWW check rejects.
  const CLOCK = 5_000;

  function setup() {
    const { store, runQueuedInOrder } = createQueuedLocalStore();
    const clock = { now: 1_000 };
    const time = { nowMs: () => clock.now };
    const ids = sequenceIds(Array.from({ length: 50 }, (_, i) => `id-${i}`));
    const service = createCategoryService({ store, time, ids });
    return { store, runQueuedInOrder, clock, time, ids, service };
  }

  /** A sync batch delivering a peer's `eventType` for the row, stamped at `CLOCK`. */
  async function peerSync(
    store: LocalStore,
    categoryId: string,
    eventType: EventType,
    changes: Partial<CategoryPayload>,
  ) {
    const current = (await store.findCategoryById(categoryId))!;
    return () => applyRemoteCategoryEvents(store, [{
      eventId: `peer-${eventType}`,
      timestamp: CLOCK,
      eventType,
      categoryId,
      payload: { ...current, ...changes, updatedAt: CLOCK },
    }], silentLogger);
  }

  async function givenCategory(
    service: CategoryService,
    kind: 'predefined' | 'custom',
  ): Promise<string> {
    if (kind === 'custom') {
      const created = await service.createCategory({ name: 'Coffee', icon: 'coffee', color: '#000' });
      return created.id;
    }
    await service.seedDefaultsIfEmpty();
    return defaultTemplateId('food');
  }

  it.each([
    { kind: 'predefined', linkedExpense: false },
    { kind: 'predefined', linkedExpense: true },
    { kind: 'custom', linkedExpense: false },
    { kind: 'custom', linkedExpense: true },
  ] as const)(
    'should delete a $kind category (linked expense: $linkedExpense) that a sync batch queued ahead of it re-stamps',
    async ({ kind, linkedExpense }) => {
      // Given: a category, optionally used by an expense, and a sync batch
      // carrying a peer's icon change
      const { store, runQueuedInOrder, clock, time, ids, service } = setup();
      const categoryId = await givenCategory(service, kind);
      if (linkedExpense) {
        await createExpenseCommandService({ store, time, ids }).createExpense({
          description: 'Lunch',
          amount: 1250,
          currency: 'USD',
          categoryId,
          date: '2026-01-01T12:00:00Z',
        });
      }
      const sync = await peerSync(store, categoryId, 'UPDATED', { icon: 'peer-icon' });

      // When: the user confirms the delete while that batch is queued ahead
      clock.now = CLOCK;
      const [syncResult, deleted] = await runQueuedInOrder(
        sync,
        () => service.deleteCategory(categoryId),
      );

      // Then: the peer update landed first, and the delete still won
      expect(syncResult.applied).toBe(1);
      expect(deleted).toBe(true);
      const archived = (await store.findCategoryById(categoryId))!;
      expect(archived).toMatchObject({ deleted: true, icon: 'peer-icon' });
      expect(archived.updatedAt).toBeGreaterThan(CLOCK);

      // And: the DELETED event carries the row as of the transaction
      const deletedEvent = store.allCategoryEvents().find((e) => e.eventType === 'DELETED')!;
      expect(JSON.parse(deletedEvent.payload)).toMatchObject({
        icon: 'peer-icon',
        deleted: true,
        updatedAt: archived.updatedAt,
      });

      // And: archived, not erased — the row stays in the catalog that
      // feeds history and Restore, and expenses keep pointing at it
      expect(await service.findAllCategories()).toContainEqual(archived);
      const expenses = await store.findActiveProjections();
      expect(expenses.map((e) => e.categoryId)).toEqual(linkedExpense ? [categoryId] : []);
    },
  );

  it('should apply an update on top of a peer change synced while it was queued', async () => {
    // Given: a category and a sync batch carrying a peer's icon change
    const { store, runQueuedInOrder, clock, service } = setup();
    const { id } = await service.createCategory({ name: 'Coffee', icon: 'coffee', color: '#000' });
    const sync = await peerSync(store, id, 'UPDATED', { icon: 'peer-icon' });

    // When: the user renames it while that batch is queued ahead
    clock.now = CLOCK;
    const [syncResult, updated] = await runQueuedInOrder(
      sync,
      () => service.updateCategory(id, { name: 'Espresso' }),
    );

    // Then: both changes survive — the rename merged onto the synced row
    expect(syncResult.applied).toBe(1);
    const stored = (await store.findCategoryById(id))!;
    expect(stored).toMatchObject({ name: 'Espresso', icon: 'peer-icon', deleted: false });
    expect(stored.updatedAt).toBeGreaterThan(CLOCK);
    expect(updated).toEqual(stored);
  });

  it('should not update a category that a sync batch deleted while the update was queued', async () => {
    // Given: a category and a sync batch carrying a peer's deletion
    const { store, runQueuedInOrder, clock, service } = setup();
    const { id } = await service.createCategory({ name: 'Coffee', icon: 'coffee', color: '#000' });
    const sync = await peerSync(store, id, 'DELETED', { deleted: true });

    // When: the user saves an edit while that batch is queued ahead
    clock.now = CLOCK;
    const [, updated] = await runQueuedInOrder(
      sync,
      () => service.updateCategory(id, { name: 'Espresso' }),
    );

    // Then: the update reports that it did not apply, and the row stays deleted
    expect(updated).toBeUndefined();
    expect(await store.findCategoryById(id)).toMatchObject({ name: 'Coffee', deleted: true });
  });

  it('should restore a category that a sync batch re-stamped while the restore was queued', async () => {
    // Given: an archived category whose deletion a peer syncs too
    const { store, runQueuedInOrder, clock, service } = setup();
    const { id } = await service.createCategory({ name: 'Coffee', icon: 'coffee', color: '#000' });
    await service.deleteCategory(id);
    const sync = await peerSync(store, id, 'DELETED', { deleted: true });

    // When: the user restores it while that batch is queued ahead
    clock.now = CLOCK;
    const [syncResult, restored] = await runQueuedInOrder(sync, () => service.restoreCategory(id));

    // Then: the peer's stamp landed first, and the restore still won
    expect(syncResult.applied).toBe(1);
    const stored = (await store.findCategoryById(id))!;
    expect(stored.deleted).toBe(false);
    expect(stored.updatedAt).toBeGreaterThan(CLOCK);
    expect(restored).toEqual(stored);
  });
});

describe('CategoryService — restoreCategory', () => {
  it('should append an UPDATED event with deleted=false', async () => {
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1', 'evt-2', 'evt-3'],
      times: [1000, 1001, 2000, 2001, 3000, 3001],
    });
    await service.createCategory({ name: 'X', icon: 'i', color: '#000' });
    await service.deleteCategory('cat-1');

    const restored = await service.restoreCategory('cat-1');
    expect(restored?.deleted).toBe(false);

    const events = store.allCategoryEvents();
    expect(events).toHaveLength(3);
    expect(events[2]?.eventType).toBe('UPDATED');

    // The row reflects the restore.
    const row = await store.findCategoryById('cat-1');
    expect(row?.deleted).toBe(false);
  });
});

describe('CategoryService — resetToDefaults', () => {
  it('should re-seed a default whose row is stamped ahead of the local clock', async () => {
    // Given: seeded defaults, then a peer's change to one of them synced
    // from a device whose clock runs ahead of ours
    const { store, service } = buildService({
      ids: Array.from({ length: 200 }, (_, i) => `id-${i}`),
      times: Array.from({ length: 200 }, (_, i) => 5_000 + i),
    });
    await service.seedDefaultsIfEmpty();
    const foodId = defaultTemplateId('food');
    const food = (await store.findCategoryById(foodId))!;
    await applyRemoteCategoryEvents(store, [{
      eventId: 'peer-update',
      timestamp: 10_000,
      eventType: 'UPDATED',
      categoryId: foodId,
      payload: { ...food, icon: 'peer-icon', updatedAt: 10_000 },
    }], silentLogger);

    // When
    const result = await service.resetToDefaults();

    // Then: every default is active again, with the template's own fields
    const active = (await service.findAllCategories()).filter((c) => !c.deleted);
    expect(active).toHaveLength(DEFAULT_CATEGORY_TEMPLATES.length);
    expect(result.seeded).toBe(DEFAULT_CATEGORY_TEMPLATES.length);
    const template = DEFAULT_CATEGORY_TEMPLATES.find((t) => t.templateKey === 'food')!;
    expect(await store.findCategoryById(foodId)).toMatchObject({
      deleted: false,
      icon: template.icon,
    });
  });

  it('should leave every category untouched when the reset fails', async () => {
    // Given: seeded defaults plus a custom category
    const { store, service } = buildService({
      ids: Array.from({ length: 200 }, (_, i) => `id-${i}`),
      times: Array.from({ length: 200 }, (_, i) => 5_000 + i),
    });
    await service.seedDefaultsIfEmpty();
    await service.createCategory({ name: 'Coffee', icon: 'coffee', color: '#000' });
    const before = await service.findAllCategories();
    const eventsBefore = store.allCategoryEvents().length;
    // The first projection in a reset is its first re-seed, after every
    // active category was archived.
    vi.spyOn(store, 'projectCategoryFromEvent').mockRejectedValueOnce(new Error('disk full'));

    // When
    await expect(service.resetToDefaults()).rejects.toThrow('disk full');

    // Then: nothing was archived and no event was kept
    expect(await service.findAllCategories()).toEqual(before);
    expect(store.allCategoryEvents()).toHaveLength(eventsBefore);
  });
});

describe('CategoryService — seedDefaultsIfEmpty', () => {
  it('should append one CREATED event per template on first run', async () => {
    // Use a generous id/time pool because the default template list
    // can be large; we only assert the event count.
    const { store, service } = buildService({
      ids: Array.from({ length: 200 }, (_, i) => `id-${i}`),
      times: Array.from({ length: 200 }, (_, i) => 1000 + i),
    });

    const count = await service.seedDefaultsIfEmpty();
    expect(count).toBeGreaterThan(0);

    // Same number of CREATED events as projected categories.
    expect(store.allCategoryEvents().length).toBe(count);
    expect(store.allCategoryEvents().every((e) => e.eventType === 'CREATED')).toBe(
      true,
    );
    expect(store.allCategories().length).toBe(count);
  });

  it('should derive each seed row id from its `templateKey` (deterministic)', async () => {
    // Two independent services with disjoint id pools must still produce
    // identical category ids — that is the contract that lets two devices
    // converge on the same row when they later sync.
    const buildSeeded = async (idPrefix: string) => {
      const { store, service } = buildService({
        ids: Array.from({ length: 50 }, (_, i) => `${idPrefix}-${i}`),
        times: Array.from({ length: 50 }, (_, i) => 1000 + i),
      });
      await service.seedDefaultsIfEmpty();
      return store;
    };
    const a = await buildSeeded('A');
    const b = await buildSeeded('B');

    const aIds = (await a.findAllCategories()).map((c) => c.id).sort();
    const bIds = (await b.findAllCategories()).map((c) => c.id).sort();
    expect(aIds).toEqual(bIds);

    // And: every seeded id matches the `defaultTemplateId` contract.
    const expectedIds = DEFAULT_CATEGORY_TEMPLATES
      .map((t) => defaultTemplateId(t.templateKey))
      .sort();
    expect(aIds).toEqual(expectedIds);
  });

  it('should be a no-op when categories already exist', async () => {
    const { store, service } = buildService({
      ids: ['cat-1', 'evt-1'].concat(
        Array.from({ length: 200 }, (_, i) => `id-${i}`),
      ),
      times: [1000, 1001].concat(
        Array.from({ length: 200 }, (_, i) => 2000 + i),
      ),
    });
    await service.createCategory({ name: 'X', icon: 'i', color: '#000' });
    const before = store.allCategoryEvents().length;

    const count = await service.seedDefaultsIfEmpty();
    expect(count).toBe(0);
    expect(store.allCategoryEvents().length).toBe(before);
  });

  it('should stamp seed rows at epoch (`updatedAt = 0`) so remote events win LWW', async () => {
    // Regression: on a fresh install (Device B), defaults used to be
    // seeded with `time.nowMs()`. When OneDrive sync later delivered
    // older customizations / deletions from Device A, the strict-`>`
    // LWW check silently rejected them and Device B kept showing only
    // defaults. Seeding at `0` makes the seed row lose every later LWW
    // race so any peer mutation propagates correctly.
    const { service } = buildService({
      ids: Array.from({ length: 200 }, (_, i) => `id-${i}`),
      // Production wall-clock would be ~1.7e12 here; use a clearly
      // non-zero stamp to make the assertion meaningful.
      times: Array.from({ length: 200 }, (_, i) => 1_700_000_000_000 + i),
    });

    await service.seedDefaultsIfEmpty();

    const seeded = await service.findAllCategories();
    for (const row of seeded) {
      expect(row.updatedAt).toBe(0);
    }
  });
});
