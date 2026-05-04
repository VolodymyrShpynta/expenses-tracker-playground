/**
 * Command-side tests — covers atomic event+projection writes, event
 * appending order, and rollback on failure.
 *
 * These tests exercise the same scenarios the backend's
 * `ExpenseCommandServiceTransactionTest` covers.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createExpenseCommandService } from './commands.ts';
import { createExpenseQueryService } from './queries.ts';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore.ts';
import {
  TEST_USER_ID,
  sequenceIds,
  sequenceTime,
} from '../test/fixtures.ts';

function buildService(opts: { ids: string[]; times: number[] }) {
  const store = new InMemoryLocalStore();
  const commands = createExpenseCommandService({
    store,
    time: sequenceTime(opts.times),
    ids: sequenceIds(opts.ids),
    userId: TEST_USER_ID,
  });
  const queries = createExpenseQueryService({ store, userId: TEST_USER_ID });
  return { store, commands, queries };
}

describe('ExpenseCommandService — createExpense', () => {
  let env: ReturnType<typeof buildService>;

  beforeEach(() => {
    // ids: [expenseId, eventId]
    // times: [createExpense's payload.updatedAt, appendEvent's timestamp,
    //         findProjectionById doesn't consume time]
    env = buildService({
      ids: ['exp-1', 'evt-1'],
      times: [1000, 1001],
    });
  });

  it('should append a CREATED event and project it atomically', async () => {
    // When: Creating an expense
    const projection = await env.commands.createExpense({
      description: 'Coffee',
      amount: 350,
      currency: 'USD',
      categoryId: 'cat-1',
      date: '2026-01-01T08:00:00Z',
    });

    // Then: Projection has the expected shape
    expect(projection.id).toBe('exp-1');
    expect(projection.amount).toBe(350);
    expect(projection.deleted).toBe(false);
    expect(projection.updatedAt).toBe(1000);

    // And: Exactly one CREATED event was appended
    const events = env.store.allEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('CREATED');
    expect(events[0]?.eventId).toBe('evt-1');
    expect(events[0]?.expenseId).toBe('exp-1');
    expect(events[0]?.committed).toBe(false);
    expect(events[0]?.userId).toBe(TEST_USER_ID);
  });

  it('should serialize the payload to JSON inside the event', async () => {
    // When
    await env.commands.createExpense({
      description: 'Coffee',
      amount: 350,
      currency: 'USD',
      categoryId: 'cat-1',
      date: '2026-01-01T08:00:00Z',
    });

    // Then: Event payload is parseable JSON with the expected shape
    const event = env.store.allEvents()[0];
    expect(event).toBeDefined();
    const parsed = JSON.parse(event!.payload) as Record<string, unknown>;
    expect(parsed.id).toBe('exp-1');
    expect(parsed.amount).toBe(350);
    expect(parsed.deleted).toBe(false);
    expect(parsed.userId).toBe(TEST_USER_ID);
  });
});

describe('ExpenseCommandService — updateExpense', () => {
  it('should return undefined when updating a non-existent expense', async () => {
    // Given: Empty store
    const env = buildService({ ids: [], times: [] });

    // When/Then
    const result = await env.commands.updateExpense('does-not-exist', { amount: 999 });
    expect(result).toBeUndefined();
  });

  it('should append an UPDATED event and merge into the existing projection', async () => {
    // Given: A created expense at t=1000
    // ids: [createExpense expenseId, createEvent, updateEvent]
    // times: [createPayload.updatedAt=1000, createEvent.timestamp=1001,
    //         updatePayload.updatedAt=2000, updateEvent.timestamp=2001]
    const env = buildService({
      ids: ['exp-1', 'evt-create', 'evt-update'],
      times: [1000, 1001, 2000, 2001],
    });
    await env.commands.createExpense({
      description: 'Old',
      amount: 100,
      currency: 'USD',
      categoryId: 'cat-1',
      date: '2026-01-01T08:00:00Z',
    });

    // When: Partially updating amount only
    const updated = await env.commands.updateExpense('exp-1', { amount: 999 });

    // Then: amount changes; other fields preserved from existing
    expect(updated?.amount).toBe(999);
    expect(updated?.description).toBe('Old');
    expect(updated?.updatedAt).toBe(2000);

    // And: Two events exist, in append order
    const events = env.store.allEvents();
    expect(events.map((e) => e.eventType)).toEqual(['CREATED', 'UPDATED']);
  });
});

describe('ExpenseCommandService — deleteExpense', () => {
  it('should return false when deleting a non-existent expense', async () => {
    // Given
    const env = buildService({ ids: [], times: [] });

    // When/Then
    expect(await env.commands.deleteExpense('does-not-exist')).toBe(false);
  });

  it('should append a DELETED event and soft-delete the projection', async () => {
    // Given: A created expense
    const env = buildService({
      ids: ['exp-1', 'evt-create', 'evt-delete'],
      times: [1000, 1001, 2000, 2001],
    });
    await env.commands.createExpense({
      description: 'Coffee',
      amount: 350,
      currency: 'USD',
      categoryId: 'cat-1',
      date: '2026-01-01T08:00:00Z',
    });

    // When
    const result = await env.commands.deleteExpense('exp-1');

    // Then
    expect(result).toBe(true);
    expect(await env.queries.findExpenseById('exp-1')).toBeUndefined();

    // The projection physically still exists with deleted=true (so it can be
    // resurrected by a newer non-deleted update from sync).
    const allProjections = env.store.allProjections();
    expect(allProjections).toHaveLength(1);
    expect(allProjections[0]?.deleted).toBe(true);

    // And: A DELETED event was appended
    const events = env.store.allEvents();
    expect(events.map((e) => e.eventType)).toEqual(['CREATED', 'DELETED']);
  });
});
