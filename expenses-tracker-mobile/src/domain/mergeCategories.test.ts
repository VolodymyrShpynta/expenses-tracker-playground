/**
 * Regression tests for `CategoryService.mergeCategories`.
 *
 * The original bug: when a source-category expense's projection had
 * `updated_at` ahead of the local clock (typical after syncing events
 * authored on a device whose clock runs faster), the LWW UPSERT inside
 * `projectFromEvent` silently rejected the reassignment, so the expense
 * kept pointing at the merged-away category even though an UPDATED
 * event was appended to the log.
 */
import { describe, expect, it, vi } from 'vitest';

import { createCategoryService } from './categoryService';
import { createExpenseCommandService } from './commands';
import { createExpenseQueryService } from './queries';
import { applyRemoteEvents } from '../sync/remoteEventApplier';
import { createTestStore } from '../test/sqliteTestStore';
import { createQueuedLocalStore } from '../test/queuedLocalStore';
import { sequenceIds, sequenceTime } from '../test/fixtures';

describe('CategoryService — mergeCategories', () => {
  it('should reassign source-category expenses to the target (cold path)', async () => {
    const store = createTestStore();
    const ids = sequenceIds(Array.from({ length: 200 }, (_, i) => `id-${i}`));
    const times = sequenceTime(
      Array.from({ length: 200 }, (_, i) => 1_000 + i),
    );
    const categories = createCategoryService({ store, time: times, ids });
    const expenseCommands = createExpenseCommandService({ store, time: times, ids });
    const expenseQueries = createExpenseQueryService({ store });

    const farm = await categories.createCategory({
      name: 'Farm', icon: 'tractor', color: '#80c080',
    });
    const pet = await categories.createCategory({
      name: 'Pet', icon: 'paw', color: '#808080',
    });
    const created = await expenseCommands.createExpense({
      description: 'Корм',
      amount: 2407,
      currency: 'USD',
      categoryId: farm.id,
      date: '2026-05-14T08:00:00Z',
    });

    const result = await categories.mergeCategories(farm.id, pet.id);

    expect(result.movedExpenses).toBe(1);
    const after = await expenseQueries.findExpenseById(created.id);
    expect(after?.categoryId).toBe(pet.id);
    expect((await store.findCategoryById(farm.id))?.deleted).toBe(true);
  });

  it('should reassign expenses whose existing projection.updatedAt is ahead of the local clock', async () => {
    // Simulate the "synced from a faster-clock peer" scenario: the
    // expense's projection has updatedAt = 10_000, but the local clock
    // (and the merge's time provider) is at 2_000. Without the fix the
    // merge silently no-ops the projection update.
    const store = createTestStore();
    const ids = sequenceIds(Array.from({ length: 200 }, (_, i) => `id-${i}`));

    // First service: seeds the categories + the expense at low timestamps.
    const seedTimes = sequenceTime(Array.from({ length: 50 }, (_, i) => 1_000 + i));
    const seedCategories = createCategoryService({ store, time: seedTimes, ids });
    const seedCommands = createExpenseCommandService({ store, time: seedTimes, ids });

    const farm = await seedCategories.createCategory({
      name: 'Farm', icon: 'tractor', color: '#80c080',
    });
    const pet = await seedCategories.createCategory({
      name: 'Pet', icon: 'paw', color: '#808080',
    });
    const created = await seedCommands.createExpense({
      description: 'Корм',
      amount: 2407,
      currency: 'USD',
      categoryId: farm.id,
      date: '2026-05-14T08:00:00Z',
    });

    // Inject a "future" projection update directly — this mimics a
    // remote UPDATED event applied through the sync path with an
    // updatedAt ahead of the local clock.
    await store.projectFromEvent({
      id: created.id,
      amount: 2407,
      currency: 'USD',
      description: 'Корм',
      categoryId: farm.id,
      date: '2026-05-14T08:00:00Z',
      deleted: false,
      updatedAt: 10_000,
    });

    // Sanity: the projection now carries the future timestamp.
    expect((await store.findProjectionById(created.id))?.updatedAt).toBe(10_000);

    // Second service: the merge runs with a much earlier wall clock.
    const mergeTimes = sequenceTime(Array.from({ length: 50 }, (_, i) => 2_000 + i));
    const mergeCategories = createCategoryService({ store, time: mergeTimes, ids });
    const mergeQueries = createExpenseQueryService({ store });

    const result = await mergeCategories.mergeCategories(farm.id, pet.id);

    expect(result.movedExpenses).toBe(1);
    const after = await mergeQueries.findExpenseById(created.id);
    expect(after?.categoryId).toBe(pet.id);
  });

  it('should also move an expense a sync batch added to the source while the merge was queued', async () => {
    // Given: Farm with one local expense, and a sync batch carrying a
    // peer's new Farm expense
    const { store, runQueuedInOrder } = createQueuedLocalStore();
    const time = { nowMs: () => 1_000 };
    const ids = sequenceIds(Array.from({ length: 50 }, (_, i) => `id-${i}`));
    const categories = createCategoryService({ store, time, ids });
    const farm = await categories.createCategory({ name: 'Farm', icon: 'tractor', color: '#80c080' });
    const pet = await categories.createCategory({ name: 'Pet', icon: 'paw', color: '#808080' });
    const local = await createExpenseCommandService({ store, time, ids }).createExpense({
      description: 'Feed', amount: 2407, currency: 'USD', categoryId: farm.id, date: '2026-05-14T08:00:00Z',
    });
    const sync = () => applyRemoteEvents(store, [{
      eventId: 'peer-create',
      timestamp: 1_500,
      eventType: 'CREATED',
      expenseId: 'peer-expense',
      payload: {
        id: 'peer-expense', amount: 990, currency: 'USD', categoryId: farm.id,
        date: '2026-05-15T08:00:00Z', updatedAt: 1_500, deleted: false,
      },
    }], { warn: () => undefined });

    // When: the user merges Farm into Pet while that batch is queued ahead
    const [, result] = await runQueuedInOrder(sync, () => categories.mergeCategories(farm.id, pet.id));

    // Then: both expenses moved, so nothing is left on the archived Farm
    expect(result.movedExpenses).toBe(2);
    const expenses = await store.findActiveProjections();
    expect(expenses.map((e) => [e.id, e.categoryId]).sort()).toEqual(
      [[local.id, pet.id], ['peer-expense', pet.id]].sort(),
    );
    expect((await store.findCategoryById(farm.id))?.deleted).toBe(true);
  });

  it('should move no expense when the merge fails', async () => {
    // Given: Farm with two expenses
    const store = createTestStore();
    const time = sequenceTime(Array.from({ length: 50 }, (_, i) => 1_000 + i));
    const ids = sequenceIds(Array.from({ length: 50 }, (_, i) => `id-${i}`));
    const categories = createCategoryService({ store, time, ids });
    const expenseCommands = createExpenseCommandService({ store, time, ids });
    const farm = await categories.createCategory({ name: 'Farm', icon: 'tractor', color: '#80c080' });
    const pet = await categories.createCategory({ name: 'Pet', icon: 'paw', color: '#808080' });
    for (const description of ['Feed', 'Seeds']) {
      await expenseCommands.createExpense({
        description, amount: 100, currency: 'USD', categoryId: farm.id, date: '2026-05-14T08:00:00Z',
      });
    }
    const eventsBefore = store.allEvents().length;
    vi.spyOn(store, 'softDeleteCategory').mockRejectedValueOnce(new Error('disk full'));

    // When: the merge fails at its last step, archiving the source
    await expect(categories.mergeCategories(farm.id, pet.id)).rejects.toThrow('disk full');

    // Then: every expense is still on Farm, Farm is active, and no event was kept
    const expenses = await store.findActiveProjections();
    expect(expenses.map((e) => e.categoryId)).toEqual([farm.id, farm.id]);
    expect((await store.findCategoryById(farm.id))?.deleted).toBe(false);
    expect(store.allEvents()).toHaveLength(eventsBefore);
  });
});
