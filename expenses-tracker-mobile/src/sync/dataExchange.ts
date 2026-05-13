/**
 * Pure helpers for the file-based "export / restore from sync" flow.
 *
 * Mobile is local-first; instead of a server-side export endpoint, the
 * user shares a single JSON file with another device. Encoding /
 * decoding goes through the same `EventSyncFile` wire format the
 * cloud-drive sync uses, so a file exported here can also be dropped
 * into the cloud sync directory and vice-versa.
 *
 * The React hook (`useDataExchange`) is a thin shell over these
 * helpers — file I/O and the OS share / picker dialogs live there;
 * domain orchestration lives here, fully unit-testable against an
 * `InMemoryLocalStore`.
 */
import { decodeSyncFile, encodeSyncFile, sortCategoryEventsDeterministically, sortEventsDeterministically } from './codec';
import { applyRemoteEvents } from './remoteEventApplier';
import { applyRemoteCategoryEvents } from './remoteCategoryEventApplier';
import { jsonToCategoryPayload, jsonToPayload } from '../domain/mapping';
import type { LocalStore } from '../domain/localStore';
import type {
  CategoryEvent,
  CategoryEventEntry,
  EventEntry,
  EventSyncFile,
  ExpenseEvent,
} from '../domain/types';

// Magic bytes for gzip — first two bytes are 0x1f 0x8b regardless of payload.
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

export interface ExportPayload {
  /** Encoded `EventSyncFile` bytes ready to be written to a file. */
  readonly bytes: Uint8Array;
  readonly eventCount: number;
  readonly categoryEventCount: number;
}

export interface ImportSummary {
  /** Sum of expense + category events newly applied. */
  readonly applied: number;
  /** Sum of expense + category events skipped (already processed). */
  readonly skipped: number;
  /** Sum of expense + category events that errored during apply. */
  readonly errors: number;
}

/**
 * Build the export bytes from the store contents. Uncompressed JSON for
 * human readability (the codec still handles gzip on import via
 * auto-detect).
 */
export async function buildExportFile(store: LocalStore): Promise<ExportPayload> {
  const [events, categoryEvents] = await Promise.all([
    store.findAllEvents(),
    store.findAllCategoryEvents(),
  ]);

  const entries: EventEntry[] = events.map(toEventEntry);
  const categoryEntries: CategoryEventEntry[] = categoryEvents.map(toCategoryEventEntry);

  const syncFile: EventSyncFile = {
    events: sortEventsDeterministically(entries),
    categoryEvents: sortCategoryEventsDeterministically(categoryEntries),
  };

  return {
    bytes: encodeSyncFile(syncFile, false),
    eventCount: entries.length,
    categoryEventCount: categoryEntries.length,
  };
}

/**
 * Decode + apply a previously-exported sync file. Auto-detects gzip via
 * the standard magic bytes so callers don't have to know the encoding.
 *
 * Categories are applied BEFORE expenses so that any expense projection
 * referencing a brand-new category sees the row in place — mirrors the
 * order used in `SyncEngine.performFullSync`.
 */
export async function applyImportedBytes(
  store: LocalStore,
  bytes: Uint8Array,
): Promise<ImportSummary> {
  const compressed = isGzipped(bytes);
  const parsed = decodeSyncFile(bytes, compressed);

  const categoryResult = await applyRemoteCategoryEvents(store, parsed.categoryEvents);
  const expenseResult = await applyRemoteEvents(store, parsed.events);

  return {
    applied: expenseResult.applied + categoryResult.applied,
    skipped: expenseResult.skipped + categoryResult.skipped,
    errors: expenseResult.errors + categoryResult.errors,
  };
}

/** Detect a gzip-compressed payload by its magic-byte prefix. Exported for tests. */
export function isGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
}

function toEventEntry(event: ExpenseEvent): EventEntry {
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    eventType: event.eventType,
    expenseId: event.expenseId,
    payload: jsonToPayload(event.payload),
  };
}

function toCategoryEventEntry(event: CategoryEvent): CategoryEventEntry {
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    eventType: event.eventType,
    categoryId: event.categoryId,
    payload: jsonToCategoryPayload(event.payload),
  };
}
