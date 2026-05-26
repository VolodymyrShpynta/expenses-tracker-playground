/**
 * Codec round-trip tests — verifies the gzipped JSON wire format used to
 * sync expense and category events across the user's mobile devices.
 */
import { describe, expect, it } from 'vitest';
import {
  decodeSyncFile,
  encodeSyncFile,
  sortCategoryEventsDeterministically,
  sortEventsDeterministically,
} from './codec';
import type {
  CategoryEventEntry,
  EventEntry,
  EventSyncFile,
} from '../domain/types';

const event = (id: string, ts: number, payloadId: string): EventEntry => ({
  eventId: id,
  timestamp: ts,
  eventType: 'CREATED',
  expenseId: payloadId,
  payload: {
    id: payloadId,
    amount: 100,
    currency: 'USD',
    updatedAt: ts,
    deleted: false,
  },
});

const categoryEvent = (
  id: string,
  ts: number,
  payloadId: string,
): CategoryEventEntry => ({
  eventId: id,
  timestamp: ts,
  eventType: 'CREATED',
  categoryId: payloadId,
  payload: {
    id: payloadId,
    name: 'Food',
    icon: 'food',
    color: '#FF0000',
    sortOrder: 0,
    updatedAt: ts,
    deleted: false,
  },
});

describe('codec', () => {
  it('round-trips an empty sync file (gzipped)', () => {
    const file: EventSyncFile = { events: [], categoryEvents: [] };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);
    expect(decoded.events).toEqual([]);
    expect(decoded.categoryEvents).toEqual([]);
    expect(decoded.snapshot).toBeUndefined();
  });

  it('round-trips an empty sync file (uncompressed)', () => {
    const file: EventSyncFile = { events: [], categoryEvents: [] };
    const bytes = encodeSyncFile(file, false);
    const decoded = decodeSyncFile(bytes, false);
    expect(decoded.events).toEqual([]);
    expect(decoded.categoryEvents).toEqual([]);
  });

  it('round-trips a populated sync file', () => {
    const file: EventSyncFile = {
      events: [event('e2', 100, 'x'), event('e1', 50, 'y')],
      categoryEvents: [],
    };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);

    // Decode applies deterministic sort by (timestamp ASC, eventId ASC).
    expect(decoded.events.map((e) => e.eventId)).toEqual(['e1', 'e2']);
  });

  it('preserves snapshot when present', () => {
    const snapshot = {
      version: 2,
      createdAt: 1000,
      expenses: [],
      categories: [],
      coveredEvents: [],
    };
    const file: EventSyncFile = {
      snapshot,
      events: [],
      categoryEvents: [],
    };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);
    expect(decoded.snapshot).toEqual(snapshot);
  });

  it('tolerates a remote file missing `events` (treats as empty)', () => {
    const json = JSON.stringify({
      snapshot: {
        version: 2,
        createdAt: 1000,
        expenses: [],
        categories: [],
        coveredEvents: [],
      },
    });
    const bytes = new TextEncoder().encode(json);
    const decoded = decodeSyncFile(bytes, false);
    expect(decoded.events).toEqual([]);
    expect(decoded.categoryEvents).toEqual([]);
  });

  it('breaks ties on equal timestamps by eventId', () => {
    const sorted = sortEventsDeterministically([
      event('b', 100, 'x'),
      event('a', 100, 'y'),
      event('c', 100, 'z'),
    ]);
    expect(sorted.map((e) => e.eventId)).toEqual(['a', 'b', 'c']);
  });

  it('sorts primarily by timestamp', () => {
    const sorted = sortEventsDeterministically([
      event('z', 200, 'x'),
      event('a', 100, 'y'),
      event('m', 150, 'z'),
    ]);
    expect(sorted.map((e) => e.timestamp)).toEqual([100, 150, 200]);
  });

  it('round-trips a file with categoryEvents (gzipped)', () => {
    const file: EventSyncFile = {
      events: [event('e1', 100, 'x')],
      categoryEvents: [categoryEvent('ce2', 200, 'c1'), categoryEvent('ce1', 100, 'c2')],
    };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);

    expect(decoded.events).toHaveLength(1);
    // Deterministic sort: (timestamp ASC, eventId ASC).
    expect(decoded.categoryEvents.map((e) => e.eventId)).toEqual(['ce1', 'ce2']);
  });

  it('always emits categoryEvents as an array (empty when none)', () => {
    // Wire format invariant: the field is required, never omitted.
    const file: EventSyncFile = {
      events: [event('e1', 100, 'x')],
      categoryEvents: [],
    };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);

    expect(decoded.categoryEvents).toEqual([]);
  });

  it('normalizes a remote file missing the categoryEvents key to []', () => {
    // Defensive against partially-written or malformed remote files —
    // the decoder guarantees the field is always an array.
    const json = JSON.stringify({ events: [] });
    const bytes = new TextEncoder().encode(json);
    const decoded = decodeSyncFile(bytes, false);
    expect(decoded.categoryEvents).toEqual([]);
  });

  it('normalizes a remote file with an explicit empty categoryEvents array', () => {
    const json = JSON.stringify({ events: [], categoryEvents: [] });
    const bytes = new TextEncoder().encode(json);
    const decoded = decodeSyncFile(bytes, false);
    expect(decoded.categoryEvents).toEqual([]);
  });

  it('sorts category events deterministically by (timestamp, eventId)', () => {
    const sorted = sortCategoryEventsDeterministically([
      categoryEvent('b', 100, 'x'),
      categoryEvent('a', 100, 'y'),
      categoryEvent('c', 50, 'z'),
    ]);
    expect(sorted.map((e) => e.eventId)).toEqual(['c', 'a', 'b']);
  });
});
