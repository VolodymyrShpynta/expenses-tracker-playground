/**
 * Query-side tests — verifies the read path hides soft-deleted rows and
 * scopes by userId.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createExpenseQueryService } from './queries.ts';
import { projectPayload } from './projector.ts';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore.ts';
import { TEST_USER_ID, makePayload } from '../test/fixtures.ts';

describe('ExpenseQueryService', () => {
  let store: InMemoryLocalStore;
  let queries: ReturnType<typeof createExpenseQueryService>;

  beforeEach(() => {
    store = new InMemoryLocalStore();
    queries = createExpenseQueryService({ store, userId: TEST_USER_ID });
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

  it('should not leak expenses from other users', async () => {
    // Given: An expense for a different user
    await projectPayload(
      store,
      makePayload({ id: 'foreign', updatedAt: 1, userId: 'other-user' }),
    );

    // Then: Current user's queries see nothing
    expect(await queries.findExpenseById('foreign')).toBeUndefined();
    expect(await queries.findAllExpenses()).toHaveLength(0);
  });
});
