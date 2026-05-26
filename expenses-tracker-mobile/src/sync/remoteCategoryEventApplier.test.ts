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
    await store.recordProcessedEvent('e-pre', 0);
    const e = makeEvent({ eventId: 'e-pre', categoryId: 'c1' });

    const result = await applyRemoteCategoryEvents(store, [e], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 1, errors: 0 });
    expect(await store.findCategoryById('c1')).toBeUndefined();
  });

  it('shares the processed_events registry with expense events', async () => {
    // UUIDs are globally unique, so a category event whose id collides
    // with an already-processed expense event must be a true duplicate.
    await store.recordProcessedEvent('shared', 0);
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
    // Two warnings: one for the chunk-level rollback ("retrying per-event")
    // and one for the actual per-event failure ("Failed to apply...").
    // The chunk warning is intentional — it tells operators why the slow
    // fallback path was taken.
    expect(warnings).toBe(2);
  });

  it('returns zero counts on an empty input', async () => {
    const result = await applyRemoteCategoryEvents(store, [], silentLogger);
    expect(result).toEqual({ applied: 0, skipped: 0, errors: 0 });
  });

  it('fresh-install regression: peer DELETED/UPDATED beats seeded defaults', async () => {
    // Regression for the user-reported bug: on Device B (fresh install),
    // `seedDefaultsIfEmpty` used to stamp default rows with `time.nowMs()`,
    // which was newer than the older customizations on the cloud-drive
    // sync file from Device A. The strict-`>` LWW UPSERT / soft-delete
    // then silently rejected every remote event, leaving Device B with
    // only defaults.
    //
    // After the fix, seed rows live at `updatedAt = 0`, so any peer
    // event with `t > 0` wins. We simulate the scenario directly: pre-
    // project a default row at `0`, then apply peer events recorded at
    // older-than-"now" wall-clock timestamps. They must take effect.
    const seededAtEpoch = {
      id: 'default-food',
      icon: 'ShoppingCart',
      color: '#5b8def',
      sortOrder: 9,
      updatedAt: 0,
      deleted: false,
      templateKey: 'food',
    };
    await store.projectCategoryFromEvent(seededAtEpoch);

    // Peer DELETED at a wall-clock timestamp older than Device B's "now"
    // but newer than the seed (0) — this is the realistic case where
    // Device A made the change weeks ago.
    const peerDelete = makeEvent({
      eventId: 'peer-del',
      categoryId: 'default-food',
      eventType: 'DELETED',
      timestamp: 1_700_000_000_000,
      payload: {
        id: 'default-food',
        templateKey: 'food',
        icon: 'ShoppingCart',
        color: '#5b8def',
        sortOrder: 9,
        updatedAt: 1_700_000_000_000,
        deleted: true,
      },
    });

    const result = await applyRemoteCategoryEvents(store, [peerDelete], silentLogger);
    expect(result).toEqual({ applied: 1, skipped: 0, errors: 0 });

    const row = await store.findCategoryById('default-food');
    expect(row?.deleted).toBe(true);
  });
});
