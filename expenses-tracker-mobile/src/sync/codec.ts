/**
 * Sync-file codec — gzipped JSON wire format consumed by all devices
 * sharing the same cloud-drive file.
 *
 * Format invariants:
 *   - Top-level shape: `{ snapshot?, events: EventEntry[], categoryEvents: CategoryEventEntry[] }`.
 *   - `events` and `categoryEvents` are both required arrays (possibly
 *     empty). Decoders normalize malformed input (missing or `null`
 *     fields) to empty arrays defensively — this isn't backward compat,
 *     it's robustness against partially-written files.
 *   - JSON is UTF-8 encoded; `JSON.stringify` is sufficient. Compact
 *     output by default — saves bytes on every upload.
 *   - Optional gzip wrapping. Default ON. The cloud-drive layer doesn't
 *     carry filenames so we negotiate the boolean out-of-band.
 *   - Events are sorted on read: `(timestamp ASC, eventId ASC)`. This
 *     deterministic ordering is critical so two devices produce
 *     identical final state when applying the same set of events.
 *
 * Throws on malformed JSON — caller decides whether to surface the error
 * or treat as "no remote events". Truly missing files surface as `null`
 * from the cloud-drive adapter, not as an exception here.
 */
import { gzip, ungzip } from 'pako';
import type {
  CategoryEventEntry,
  EventEntry,
  EventSyncFile,
} from '../domain/types';

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

  // Normalize missing arrays to empty — defensive against partial writes.
  return {
    events: sortEventsDeterministically(parsed.events ?? []),
    categoryEvents: sortCategoryEventsDeterministically(parsed.categoryEvents ?? []),
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

/**
 * Sort category events deterministically by the same key as
 * `sortEventsDeterministically`. Kept as a separate function so the
 * caller doesn't need to widen its type to satisfy a generic.
 */
export function sortCategoryEventsDeterministically(
  events: ReadonlyArray<CategoryEventEntry>,
): ReadonlyArray<CategoryEventEntry> {
  if (events.length === 0) return events;
  return [...events].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.eventId < b.eventId) return -1;
    if (a.eventId > b.eventId) return 1;
    return 0;
  });
}
