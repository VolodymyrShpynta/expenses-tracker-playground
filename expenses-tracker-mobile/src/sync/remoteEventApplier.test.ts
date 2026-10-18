/**
 * Remote-event applier tests — verifies the idempotent apply pipeline
 * that mirrors `RemoteEventProcessor` + `ExpenseSyncProjector` +
 * `ExpenseSyncRecorder` from the backend.
 *
 * Test coverage matches the relevant scenarios from
 * `ExpenseSyncProjectorTransactionTest` and `RemoteEventProcessorTest`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyRemoteEvents } from './remoteEventApplier';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import type { EventEntry } from '../domain/types';

const silentLogger = { warn: () => undefined };

const makeEvent = (overrides: Partial<EventEntry> & {
  eventId: string;
  expenseId: string;
}): EventEntry => ({
  timestamp: overrides.timestamp ?? 100,
  eventType: overrides.eventType ?? 'CREATED',
  payload: overrides.payload ?? {
    id: overrides.expenseId,
    amount: 1000,
    currency: 'USD',
    updatedAt: overrides.timestamp ?? 100,
    deleted: false,
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
    expect(await store.findProjectionById('x1')).toBeDefined();
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
    await store.recordProcessedEvent('e-pre', 0);
    const e = makeEvent({ eventId: 'e-pre', expenseId: 'x1' });

    const result = await applyRemoteEvents(store, [e], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 1, errors: 0 });
    // No projection — confirms the event was skipped, not applied.
    expect(await store.findProjectionById('x1')).toBeUndefined();
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
      },
    });

    await applyRemoteEvents(store, [created, updated], silentLogger);
    const row = await store.findProjectionById('x1');
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
      },
    });

    await applyRemoteEvents(store, [created, stale], silentLogger);
    const row = await store.findProjectionById('x1');
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
      },
    });

    await applyRemoteEvents(store, [created, deleted], silentLogger);
    const row = await store.findProjectionById('x1');
    expect(row?.deleted).toBe(true);
  });

  it('inserts a tombstone when a DELETED sorts before the CREATED it supersedes', async () => {
    // Given: the deleting device's clock was behind the creator's
    const deleted = makeEvent({
      eventId: 'delete',
      expenseId: 'x1',
      eventType: 'DELETED',
      timestamp: 10,
      payload: { id: 'x1', amount: 1000, currency: 'USD', updatedAt: 21, deleted: true },
    });
    const created = makeEvent({ eventId: 'create', expenseId: 'x1', timestamp: 20 });

    // When
    const result = await applyRemoteEvents(store, [deleted, created], silentLogger);

    // Then
    expect(result).toEqual({ applied: 1, skipped: 1, errors: 0 });
    expect(await store.findProjectionById('x1')).toMatchObject({ deleted: true, updatedAt: 21, amount: 1000 });
  });

  it('keeps existing content when a DELETED targets an existing row', async () => {
    // Given
    const created = makeEvent({ eventId: 'create', expenseId: 'x1', timestamp: 100 });
    await applyRemoteEvents(store, [created], silentLogger);
    const deleted = makeEvent({
      eventId: 'delete',
      expenseId: 'x1',
      eventType: 'DELETED',
      timestamp: 200,
      payload: { id: 'x1', updatedAt: 200, deleted: true },
    });

    // When
    await applyRemoteEvents(store, [deleted], silentLogger);

    // Then
    expect(await store.findProjectionById('x1')).toMatchObject({
      deleted: true, updatedAt: 200, amount: 1000, currency: 'USD',
    });
  });

  it('counts equal and stale events as skipped after their processed IDs expire', async () => {
    // Given
    const current = makeEvent({ eventId: 'current', expenseId: 'x1', timestamp: 200 });
    await applyRemoteEvents(store, [current], silentLogger);
    await store.pruneCommittedEvents(300);
    const stale = makeEvent({ eventId: 'stale', expenseId: 'x1', timestamp: 100 });

    // When
    const result = await applyRemoteEvents(store, [current, stale], silentLogger);

    // Then
    expect(result).toEqual({ applied: 0, skipped: 2, errors: 0 });
    expect(await store.isEventProcessed('current')).toBe(true);
    expect(await store.isEventProcessed('stale')).toBe(true);
    expect((await store.findProjectionById('x1'))?.updatedAt).toBe(200);
  });

  it('counts only committed changes after a chunk rollback and per-event fallback', async () => {
    // Given
    const existing = makeEvent({ eventId: 'existing', expenseId: 'x1' });
    await store.projectFromEvent(existing.payload);
    const project = store.projectFromEvent.bind(store);
    store.projectFromEvent = async (row) => {
      if (row.id === 'bad') throw new Error('projection failed');
      return project(row);
    };
    const fresh = makeEvent({ eventId: 'fresh', expenseId: 'x2' });
    const bad = makeEvent({ eventId: 'bad', expenseId: 'bad' });

    // When
    const result = await applyRemoteEvents(store, [fresh, existing, bad], silentLogger);

    // Then
    expect(result).toEqual({ applied: 1, skipped: 1, errors: 1 });
    expect(await store.isEventProcessed('fresh')).toBe(true);
    expect(await store.isEventProcessed('existing')).toBe(true);
    expect(await store.isEventProcessed('bad')).toBe(false);
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
    // Two warnings: one for the chunk-level rollback ("retrying per-event")
    // and one for the actual per-event failure ("Failed to apply...").
    // The chunk warning is intentional — it tells operators why the slow
    // fallback path was taken.
    expect(warnings).toBe(2);
  });

  it('returns zero counts on an empty input', async () => {
    const result = await applyRemoteEvents(store, [], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 0, errors: 0 });
  });
});
