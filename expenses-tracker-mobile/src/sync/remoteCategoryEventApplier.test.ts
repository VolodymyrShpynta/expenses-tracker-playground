/**
 * Remote category-event applier tests — direct sibling of
 * `remoteEventApplier.test.ts`. Verifies the idempotent apply pipeline
 * for the category aggregate.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyRemoteCategoryEvents } from './remoteCategoryEventApplier';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import type { CategoryEventEntry } from '../domain/types';

const silentLogger = { warn: () => undefined };

const makeEvent = (
  overrides: Partial<CategoryEventEntry> & {
    eventId: string;
    categoryId: string;
  },
): CategoryEventEntry => ({
  timestamp: overrides.timestamp ?? 100,
  eventType: overrides.eventType ?? 'CREATED',
  payload: overrides.payload ?? {
    id: overrides.categoryId,
    name: 'Food',
    icon: 'food',
    color: '#FF0000',
    sortOrder: 0,
    updatedAt: overrides.timestamp ?? 100,
    deleted: false,
  },
  ...overrides,
});

describe('applyRemoteCategoryEvents', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    store = new InMemoryLocalStore();
  });

  it('applies a CREATED event to a fresh store', async () => {
    const e = makeEvent({ eventId: 'e1', categoryId: 'c1' });
    const result = await applyRemoteCategoryEvents(store, [e], silentLogger);

    expect(result).toEqual({ applied: 1, skipped: 0, errors: 0 });
    expect(await store.findCategoryById('c1')).toBeDefined();
    expect(await store.isEventProcessed('e1')).toBe(true);
  });

  it('is idempotent — re-applying the same event is a no-op', async () => {
    const e = makeEvent({ eventId: 'e1', categoryId: 'c1' });
    await applyRemoteCategoryEvents(store, [e], silentLogger);
    const second = await applyRemoteCategoryEvents(store, [e], silentLogger);

    expect(second).toEqual({ applied: 0, skipped: 1, errors: 0 });
  });

  it('skips already-processed events (DB recheck)', async () => {
    await store.recordProcessedEvent('e-pre');
    const e = makeEvent({ eventId: 'e-pre', categoryId: 'c1' });

    const result = await applyRemoteCategoryEvents(store, [e], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 1, errors: 0 });
    expect(await store.findCategoryById('c1')).toBeUndefined();
  });

  it('shares the processed_events registry with expense events', async () => {
    // UUIDs are globally unique, so a category event whose id collides
    // with an already-processed expense event must be a true duplicate.
    await store.recordProcessedEvent('shared');
    const e = makeEvent({ eventId: 'shared', categoryId: 'c1' });

    const result = await applyRemoteCategoryEvents(store, [e], silentLogger);
    expect(result.skipped).toBe(1);
    expect(await store.findCategoryById('c1')).toBeUndefined();
  });

  it('handles UPDATED with last-write-wins (newer overwrites older)', async () => {
    const created = makeEvent({
      eventId: 'e1',
      categoryId: 'c1',
      timestamp: 100,
      payload: {
        id: 'c1',
        name: 'Old',
        icon: 'old',
        color: '#000',
        sortOrder: 0,
        updatedAt: 100,
        deleted: false,
      },
    });
    const updated = makeEvent({
      eventId: 'e2',
      categoryId: 'c1',
      eventType: 'UPDATED',
      timestamp: 200,
      payload: {
        id: 'c1',
        name: 'New',
        icon: 'new',
        color: '#FFF',
        sortOrder: 1,
        updatedAt: 200,
        deleted: false,
      },
    });

    await applyRemoteCategoryEvents(store, [created, updated], silentLogger);
    const row = await store.findCategoryById('c1');
    expect(row?.name).toBe('New');
    expect(row?.icon).toBe('new');
  });

  it('rejects an UPDATED with an older timestamp (LWW)', async () => {
    const created = makeEvent({
      eventId: 'e1',
      categoryId: 'c1',
      timestamp: 200,
      payload: {
        id: 'c1',
        name: 'New',
        icon: 'new',
        color: '#FFF',
        sortOrder: 1,
        updatedAt: 200,
        deleted: false,
      },
    });
    const stale = makeEvent({
      eventId: 'e2',
      categoryId: 'c1',
      eventType: 'UPDATED',
      timestamp: 100,
      payload: {
        id: 'c1',
        name: 'Old',
        icon: 'old',
        color: '#000',
        sortOrder: 0,
        updatedAt: 100,
        deleted: false,
      },
    });

    await applyRemoteCategoryEvents(store, [created, stale], silentLogger);
    const row = await store.findCategoryById('c1');
    expect(row?.name).toBe('New');
    // The stale event was still recorded as processed so we never retry it.
    expect(await store.isEventProcessed('e2')).toBe(true);
  });

  it('handles DELETED via soft-delete (newer timestamp wins)', async () => {
    const created = makeEvent({
      eventId: 'e1',
      categoryId: 'c1',
      timestamp: 100,
    });
    const deleted = makeEvent({
      eventId: 'e2',
      categoryId: 'c1',
      eventType: 'DELETED',
      timestamp: 200,
      payload: {
        id: 'c1',
        name: 'Food',
        icon: 'food',
        color: '#FF0000',
        sortOrder: 0,
        updatedAt: 200,
        deleted: true,
      },
    });

    await applyRemoteCategoryEvents(store, [created, deleted], silentLogger);
    const row = await store.findCategoryById('c1');
    expect(row?.deleted).toBe(true);
  });

  it('supports resurrection — newer UPDATED supersedes older DELETED', async () => {
    const created = makeEvent({
      eventId: 'e1',
      categoryId: 'c1',
      timestamp: 100,
    });
    const deleted = makeEvent({
      eventId: 'e2',
      categoryId: 'c1',
      eventType: 'DELETED',
      timestamp: 200,
      payload: {
        id: 'c1',
        name: 'Food',
        icon: 'food',
        color: '#FF0000',
        sortOrder: 0,
        updatedAt: 200,
        deleted: true,
      },
    });
    const resurrected = makeEvent({
      eventId: 'e3',
      categoryId: 'c1',
      eventType: 'UPDATED',
      timestamp: 300,
      payload: {
        id: 'c1',
        name: 'Resurrected',
        icon: 'food',
        color: '#FF0000',
        sortOrder: 0,
        updatedAt: 300,
        deleted: false,
      },
    });

    await applyRemoteCategoryEvents(
      store,
      [created, deleted, resurrected],
      silentLogger,
    );
    const row = await store.findCategoryById('c1');
    expect(row?.deleted).toBe(false);
    expect(row?.name).toBe('Resurrected');
  });

  it('isolates per-event errors — one bad event does not abort the batch', async () => {
    const original = store.projectCategoryFromEvent.bind(store);
    store.projectCategoryFromEvent = async (c) => {
      if (c.id === 'fail') throw new Error('boom');
      return original(c);
    };

    const ok = makeEvent({ eventId: 'eA', categoryId: 'good' });
    const bad = makeEvent({ eventId: 'eB', categoryId: 'fail' });
    const ok2 = makeEvent({ eventId: 'eC', categoryId: 'good2' });

    let warnings = 0;
    const log = { warn: () => (warnings += 1) };

    const result = await applyRemoteCategoryEvents(store, [ok, bad, ok2], log);
    expect(result).toEqual({ applied: 2, skipped: 0, errors: 1 });
    expect(warnings).toBe(1);
  });

  it('returns zero counts on an empty input', async () => {
    const result = await applyRemoteCategoryEvents(store, [], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 0, errors: 0 });
  });
});
