/**
 * Tests for the snapshot refresh policy + body truncation helper.
 *
 * `shouldRefreshSnapshot`:
 *   1. No base snapshot → always refresh (first writer sets it).
 *   2. Base snapshot present, post-cutoff events under threshold → keep.
 *   3. Base snapshot present, post-cutoff events over threshold → refresh.
 *
 * `dropCoveredEvents`:
 *   - Removes events whose IDs are in `coveredEvents`.
 *   - Empty inputs are no-ops.
 *   - Idempotent under repeated application.
 *
 * Also pins the public `SNAPSHOT_REFRESH_THRESHOLD` constant so changes
 * to it become an obvious diff in review (the value is a deliberate
 * tuning choice, not a magic number).
 */
import { describe, expect, it } from 'vitest';
import type {
  CategoryEventEntry,
  CoveredEvent,
  EventEntry,
  SyncFileSnapshot,
} from '../domain/types';
import {
  SNAPSHOT_REFRESH_THRESHOLD,
  dropCoveredEvents,
  shouldRefreshSnapshot,
} from './snapshotPolicy';

const eventAt = (ts: number, id = `e${ts}`): EventEntry => ({
  eventId: id,
  timestamp: ts,
  eventType: 'CREATED',
  expenseId: id,
  payload: { id, amount: 1, currency: 'USD', updatedAt: ts, deleted: false },
});

const categoryEventAt = (ts: number, id = `c${ts}`): CategoryEventEntry => ({
  eventId: id,
  timestamp: ts,
  eventType: 'CREATED',
  categoryId: id,
  payload: {
    id,
    name: 'cat',
    icon: 'x',
    color: '#000',
    sortOrder: 0,
    updatedAt: ts,
    deleted: false,
  },
});

const snapshotAt = (createdAt: number): SyncFileSnapshot => ({
  version: 2,
  createdAt,
  expenses: [],
  categories: [],
  coveredEvents: [],
});

const covered = (...ids: string[]): ReadonlyArray<CoveredEvent> =>
  ids.map((eventId) => ({ eventId, timestamp: 0 }));

describe('snapshotPolicy', () => {
  it('pins SNAPSHOT_REFRESH_THRESHOLD', () => {
    // The threshold tunes cold-install latency vs bandwidth per cycle —
    // changing it is a deliberate decision and should show up in diffs.
    expect(SNAPSHOT_REFRESH_THRESHOLD).toBe(500);
  });

  it('refreshes when no base snapshot exists', () => {
    expect(shouldRefreshSnapshot(undefined, [], [])).toBe(true);
    expect(shouldRefreshSnapshot(undefined, [eventAt(1)], [])).toBe(true);
  });

  it('keeps the snapshot when post-cutoff events are under threshold', () => {
    const snapshot = snapshotAt(1000);
    const events = [eventAt(1500), eventAt(2000)];
    const categoryEvents = [categoryEventAt(2500)];

    expect(shouldRefreshSnapshot(snapshot, events, categoryEvents, 10))
      .toBe(false);
  });

  it('ignores events at or before the cutoff (strict `>`)', () => {
    const snapshot = snapshotAt(1000);
    // Both at the cutoff — covered by the snapshot.
    const events = [eventAt(1000, 'a'), eventAt(500, 'b')];
    expect(shouldRefreshSnapshot(snapshot, events, [], 0)).toBe(false);
  });

  it('refreshes when post-cutoff events exceed the threshold', () => {
    const snapshot = snapshotAt(1000);
    // 3 expense events past cutoff + 1 category event past cutoff = 4 > 3.
    const events = [eventAt(1100, 'a'), eventAt(1200, 'b'), eventAt(1300, 'c')];
    const categoryEvents = [categoryEventAt(1400, 'd')];
    expect(shouldRefreshSnapshot(snapshot, events, categoryEvents, 3))
      .toBe(true);
  });

  it('counts both event streams together against the threshold', () => {
    const snapshot = snapshotAt(0);
    // 5 total events, threshold 4 → refresh.
    const events = [eventAt(1, 'a'), eventAt(2, 'b'), eventAt(3, 'c')];
    const categoryEvents = [categoryEventAt(4, 'd'), categoryEventAt(5, 'e')];
    expect(shouldRefreshSnapshot(snapshot, events, categoryEvents, 4))
      .toBe(true);
  });

  it('uses the SNAPSHOT_REFRESH_THRESHOLD constant by default', () => {
    const snapshot = snapshotAt(0);
    // Exactly threshold + 1 events past cutoff → must trigger refresh.
    const events = Array.from({ length: SNAPSHOT_REFRESH_THRESHOLD + 1 }, (_, i) =>
      eventAt(i + 1, `e${i}`),
    );
    expect(shouldRefreshSnapshot(snapshot, events, [])).toBe(true);
  });

  it('does not refresh when post-cutoff count equals threshold', () => {
    const snapshot = snapshotAt(0);
    const events = Array.from({ length: SNAPSHOT_REFRESH_THRESHOLD }, (_, i) =>
      eventAt(i + 1, `e${i}`),
    );
    expect(shouldRefreshSnapshot(snapshot, events, [])).toBe(false);
  });
});

describe('dropCoveredEvents', () => {
  it('returns the input unchanged when coveredEvents is empty', () => {
    const events = [eventAt(1, 'a'), eventAt(2, 'b')];
    expect(dropCoveredEvents(events, [])).toBe(events);
  });

  it('returns the input unchanged when events is empty', () => {
    const events: EventEntry[] = [];
    expect(dropCoveredEvents(events, covered('x', 'y'))).toBe(events);
  });

  it('removes events whose eventId is covered', () => {
    const a = eventAt(1, 'a');
    const b = eventAt(2, 'b');
    const c = eventAt(3, 'c');
    const result = dropCoveredEvents([a, b, c], covered('b'));
    expect(result.map((e) => e.eventId)).toEqual(['a', 'c']);
  });

  it('removes all events when every id is covered', () => {
    const a = eventAt(1, 'a');
    const b = eventAt(2, 'b');
    expect(dropCoveredEvents([a, b], covered('a', 'b'))).toEqual([]);
  });

  it('is idempotent under repeated application', () => {
    const events = [eventAt(1, 'a'), eventAt(2, 'b'), eventAt(3, 'c')];
    const coveredB = covered('b');
    const once = dropCoveredEvents(events, coveredB);
    const twice = dropCoveredEvents(once, coveredB);
    expect(twice.map((e) => e.eventId)).toEqual(['a', 'c']);
    expect(twice).toEqual(once);
  });

  it('works on category event entries (generic over eventId)', () => {
    const a = categoryEventAt(1, 'a');
    const b = categoryEventAt(2, 'b');
    const result = dropCoveredEvents([a, b], covered('a'));
    expect(result.map((e) => e.eventId)).toEqual(['b']);
  });
});
