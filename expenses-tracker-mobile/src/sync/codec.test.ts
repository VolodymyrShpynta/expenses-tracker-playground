/**
 * Codec round-trip tests — verifies the gzipped JSON wire format the
 * mobile module shares with the backend. The backend's
 * `SyncFileManagerTest` exercises the same scenarios on the Kotlin side;
 * keep these in sync.
 */
import { describe, expect, it } from 'vitest';
import { decodeSyncFile, encodeSyncFile, sortEventsDeterministically } from './codec.ts';
import type { EventEntry, EventSyncFile } from '../domain/types.ts';

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
    userId: 'u1',
  },
  userId: 'u1',
});

describe('codec', () => {
  it('round-trips an empty sync file (gzipped)', () => {
    const file: EventSyncFile = { events: [] };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);
    expect(decoded.events).toEqual([]);
    expect(decoded.snapshot).toBeUndefined();
  });

  it('round-trips an empty sync file (uncompressed)', () => {
    const file: EventSyncFile = { events: [] };
    const bytes = encodeSyncFile(file, false);
    const decoded = decodeSyncFile(bytes, false);
    expect(decoded.events).toEqual([]);
  });

  it('round-trips a populated sync file', () => {
    const file: EventSyncFile = {
      events: [event('e2', 100, 'x'), event('e1', 50, 'y')],
    };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);

    // Decode applies deterministic sort by (timestamp ASC, eventId ASC).
    expect(decoded.events.map((e) => e.eventId)).toEqual(['e1', 'e2']);
  });

  it('preserves snapshot when present', () => {
    const file: EventSyncFile = {
      snapshot: { version: 1, expenses: [] },
      events: [],
    };
    const bytes = encodeSyncFile(file, true);
    const decoded = decodeSyncFile(bytes, true);
    expect(decoded.snapshot).toEqual({ version: 1, expenses: [] });
  });

  it('tolerates a remote file missing `events` (treats as empty)', () => {
    const json = JSON.stringify({ snapshot: { version: 1, expenses: [] } });
    const bytes = new TextEncoder().encode(json);
    const decoded = decodeSyncFile(bytes, false);
    expect(decoded.events).toEqual([]);
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
});
