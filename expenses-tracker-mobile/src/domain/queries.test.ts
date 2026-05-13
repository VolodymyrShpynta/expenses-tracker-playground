/**
 * Query-side tests — verifies the read path hides soft-deleted rows.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createExpenseQueryService } from './queries';
import { projectPayload } from './projector';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { makePayload } from '../test/fixtures';

describe('ExpenseQueryService', () => {
  let store: InMemoryLocalStore;
  let queries: ReturnType<typeof createExpenseQueryService>;

  beforeEach(() => {
    store = new InMemoryLocalStore();
    queries = createExpenseQueryService({ store });
  });

  it('should return only active expenses from findAllExpenses', async () => {
    // Given: Two active and one deleted expense
    await projectPayload(store, makePayload({ id: 'a', updatedAt: 1, description: 'A' }));
    await projectPayload(store, makePayload({ id: 'b', updatedAt: 1, description: 'B' }));
    await projectPayload(
      store,
      makePayload({ id: 'c', updatedAt: 1, description: 'C', deleted: true }),
    );

    // When
    const all = await queries.findAllExpenses();

    // Then: Only the two active rows
    expect(all.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('should return undefined for soft-deleted expense in findExpenseById', async () => {
    // Given: A soft-deleted expense
    await projectPayload(store, makePayload({ id: 'x', updatedAt: 1, deleted: true }));

    // When/Then
    expect(await queries.findExpenseById('x')).toBeUndefined();
    expect(await queries.exists('x')).toBe(false);
  });

  it('should return the projection for an active expense', async () => {
    // Given: An active expense
    await projectPayload(store, makePayload({ id: 'x', updatedAt: 1 }));

    // When
    const found = await queries.findExpenseById('x');

    // Then
    expect(found?.id).toBe('x');
    expect(await queries.exists('x')).toBe(true);
  });
});
