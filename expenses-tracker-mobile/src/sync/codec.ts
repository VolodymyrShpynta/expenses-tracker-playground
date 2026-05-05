/**
 * Sync-file codec — the byte-for-byte counterpart of the backend's
 * `FileOperations.readJson` / `writeJson` + Jackson pretty-printer.
 *
 * Format invariants (MUST stay in sync with `EventSyncFile.kt`):
 *   - Top-level shape: `{ snapshot?: ..., events: EventEntry[] }`.
 *   - JSON is UTF-8 encoded; `JSON.stringify` is sufficient (the backend's
 *     pretty-printer adds whitespace but JSON parsers ignore that, so
 *     pretty vs. compact is irrelevant for correctness — pick compact to
 *     save bytes).
 *   - Optional gzip wrapping. The backend appends `.gz` to the file name
 *     when compression is enabled; the cloud-drive layer doesn't carry
 *     filenames so we negotiate the boolean out-of-band (default: gzip
 *     ON to mirror backend defaults).
 *   - Events are sorted on read: `(timestamp ASC, eventId ASC)`. This
 *     deterministic ordering is critical so two devices produce identical
 *     final state when applying the same set of remote events.
 *
 * Throws on malformed JSON — caller decides whether to surface the error
 * or treat as "no remote events". (Mirrors backend's `runCatching { ... }
 * .getOrNull()` — but errors here are programmer/input bugs, never
 * "expected" missing files; that's `null` from the adapter's `download`.)
 */
import { gzip, ungzip } from 'pako';
import type { EventEntry, EventSyncFile } from '../domain/types';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8');

/**
 * Decode bytes from cloud storage into an `EventSyncFile`.
 *
 * @param bytes raw payload from `CloudDriveAdapter.download`.
 * @param compressed whether the payload is gzip-wrapped (default: true).
 */
export function decodeSyncFile(
  bytes: Uint8Array,
  compressed = true,
): EventSyncFile {
  const json = compressed ? TEXT_DECODER.decode(ungzip(bytes)) : TEXT_DECODER.decode(bytes);
  const parsed = JSON.parse(json) as Partial<EventSyncFile>;

  // Tolerate older / partial files that omit `events`.
  const events = sortEventsDeterministically(parsed.events ?? []);

  // Spread-conditional pattern keeps `exactOptionalPropertyTypes` happy.
  return {
    events,
    ...(parsed.snapshot !== undefined ? { snapshot: parsed.snapshot } : {}),
  };
}

/**
 * Encode an `EventSyncFile` to bytes for upload. Events are NOT re-sorted
 * here — the caller (engine) is responsible for the order it wants on
 * disk, which keeps this function a pure (de)serializer.
 */
export function encodeSyncFile(file: EventSyncFile, compressed = true): Uint8Array {
  const json = JSON.stringify(file);
  const utf8 = TEXT_ENCODER.encode(json);
  return compressed ? gzip(utf8) : utf8;
}

/**
 * Sort events deterministically: timestamp ASC, eventId ASC as tiebreaker.
 * Mirrors `SyncFileManager.sortEventsDeterministically` so two devices
 * applying the same remote set converge to identical projection rows.
 */
export function sortEventsDeterministically(
  events: ReadonlyArray<EventEntry>,
): ReadonlyArray<EventEntry> {
  if (events.length === 0) return events;
  return [...events].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.eventId < b.eventId) return -1;
    if (a.eventId > b.eventId) return 1;
    return 0;
  });
}
