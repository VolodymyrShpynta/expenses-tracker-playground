/**
 * Remote-event applier tests — verifies the idempotent apply pipeline
 * that mirrors `RemoteEventProcessor` + `ExpenseSyncProjector` +
 * `ExpenseSyncRecorder` from the backend.
 *
 * Test coverage matches the relevant scenarios from
 * `ExpenseSyncProjectorTransactionTest` and `RemoteEventProcessorTest`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyRemoteEvents } from './remoteEventApplier.ts';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore.ts';
import { TEST_USER_ID } from '../test/fixtures.ts';
import type { EventEntry } from '../domain/types.ts';

const silentLogger = { warn: () => undefined };

const makeEvent = (overrides: Partial<EventEntry> & {
  eventId: string;
  expenseId: string;
}): EventEntry => ({
  timestamp: overrides.timestamp ?? 100,
  eventType: overrides.eventType ?? 'CREATED',
  userId: overrides.userId ?? TEST_USER_ID,
  payload: overrides.payload ?? {
    id: overrides.expenseId,
    amount: 1000,
    currency: 'USD',
    updatedAt: overrides.timestamp ?? 100,
    deleted: false,
    userId: TEST_USER_ID,
  },
  ...overrides,
});

describe('applyRemoteEvents', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    store = new InMemoryLocalStore();
  });

  it('applies a CREATED event to a fresh store', async () => {
    const e = makeEvent({ eventId: 'e1', expenseId: 'x1' });
    const result = await applyRemoteEvents(store, [e], silentLogger);

    expect(result).toEqual({ applied: 1, skipped: 0, errors: 0 });
    expect(await store.findProjectionById('x1', TEST_USER_ID)).toBeDefined();
    expect(await store.isEventProcessed('e1')).toBe(true);
  });

  it('is idempotent — re-applying the same event is a no-op', async () => {
    const e = makeEvent({ eventId: 'e1', expenseId: 'x1' });
    await applyRemoteEvents(store, [e], silentLogger);
    const second = await applyRemoteEvents(store, [e], silentLogger);

    expect(second).toEqual({ applied: 0, skipped: 1, errors: 0 });
  });

  it('skips already-processed events even when not in cache (DB recheck)', async () => {
    // Pre-record the eventId in the processed registry but skip the projection.
    await store.recordProcessedEvent('e-pre');
    const e = makeEvent({ eventId: 'e-pre', expenseId: 'x1' });

    const result = await applyRemoteEvents(store, [e], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 1, errors: 0 });
    // No projection — confirms the event was skipped, not applied.
    expect(await store.findProjectionById('x1', TEST_USER_ID)).toBeUndefined();
  });

  it('handles UPDATED with last-write-wins (newer overwrites older)', async () => {
    const created = makeEvent({
      eventId: 'e1',
      expenseId: 'x1',
      timestamp: 100,
      payload: {
        id: 'x1',
        amount: 1000,
        currency: 'USD',
        updatedAt: 100,
        deleted: false,
        userId: TEST_USER_ID,
      },
    });
    const updated = makeEvent({
      eventId: 'e2',
      expenseId: 'x1',
      eventType: 'UPDATED',
      timestamp: 200,
      payload: {
        id: 'x1',
        amount: 5000,
        currency: 'EUR',
        updatedAt: 200,
        deleted: false,
        userId: TEST_USER_ID,
      },
    });

    await applyRemoteEvents(store, [created, updated], silentLogger);
    const row = await store.findProjectionById('x1', TEST_USER_ID);
    expect(row?.amount).toBe(5000);
    expect(row?.currency).toBe('EUR');
  });

  it('rejects an UPDATED with an older timestamp (LWW)', async () => {
    const created = makeEvent({
      eventId: 'e1',
      expenseId: 'x1',
      timestamp: 200,
      payload: {
        id: 'x1',
        amount: 5000,
        currency: 'EUR',
        updatedAt: 200,
        deleted: false,
        userId: TEST_USER_ID,
      },
    });
    const stale = makeEvent({
      eventId: 'e2',
      expenseId: 'x1',
      eventType: 'UPDATED',
      timestamp: 100,
      payload: {
        id: 'x1',
        amount: 1000,
        currency: 'USD',
        updatedAt: 100,
        deleted: false,
        userId: TEST_USER_ID,
      },
    });

    await applyRemoteEvents(store, [created, stale], silentLogger);
    const row = await store.findProjectionById('x1', TEST_USER_ID);
    expect(row?.amount).toBe(5000);
    // The stale event was still recorded as processed (so we never retry it).
    expect(await store.isEventProcessed('e2')).toBe(true);
  });

  it('handles DELETED via markAsDeleted (newer timestamp wins)', async () => {
    const created = makeEvent({
      eventId: 'e1',
      expenseId: 'x1',
      timestamp: 100,
    });
    const deleted = makeEvent({
      eventId: 'e2',
      expenseId: 'x1',
      eventType: 'DELETED',
      timestamp: 200,
      payload: {
        id: 'x1',
        amount: 1000,
        currency: 'USD',
        updatedAt: 200,
        deleted: true,
        userId: TEST_USER_ID,
      },
    });

    await applyRemoteEvents(store, [created, deleted], silentLogger);
    const row = await store.findProjectionById('x1', TEST_USER_ID);
    expect(row?.deleted).toBe(true);
  });

  it('isolates per-event errors — one bad event does not abort the batch', async () => {
    // Stub `projectFromEvent` to throw on a specific id.
    const original = store.projectFromEvent.bind(store);
    store.projectFromEvent = async (p) => {
      if (p.id === 'fail') throw new Error('boom');
      return original(p);
    };

    const ok = makeEvent({ eventId: 'eA', expenseId: 'good' });
    const bad = makeEvent({ eventId: 'eB', expenseId: 'fail' });
    const ok2 = makeEvent({ eventId: 'eC', expenseId: 'good2' });

    let warnings = 0;
    const log = { warn: () => (warnings += 1) };

    const result = await applyRemoteEvents(store, [ok, bad, ok2], log);
    expect(result).toEqual({ applied: 2, skipped: 0, errors: 1 });
    expect(warnings).toBe(1);
  });

  it('returns zero counts on an empty input', async () => {
    const result = await applyRemoteEvents(store, [], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 0, errors: 0 });
  });
});
