/**
 * Sync engine — orchestrates the full sync cycle.
 *
 * Direct port of the backend's `ExpenseEventSyncService.performFullSync`,
 * adapted for cloud drives instead of a local file path:
 *
 *   1. Download the remote sync file (skip if etag unchanged since last sync).
 *   2. Decode + apply all events through `applyRemoteEvents` (idempotent).
 *   3. Collect local uncommitted events; merge into the file payload;
 *      upload with `If-Match` set to the etag we downloaded.
 *   4. Mark uploaded events committed locally and cache the new etag.
 *
 * Concurrency control: the upload uses optimistic eTag concurrency. If the
 * remote eTag has moved (another device wrote between our download and
 * our upload), the adapter throws `ConcurrencyError` and the engine
 * retries the cycle — bounded by `MAX_RETRIES` to avoid livelock.
 *
 * The engine is provider-agnostic — it depends only on
 * `CloudDriveAdapter` (DIP). Tests inject an in-memory adapter.
 */
import {
  ConcurrencyError,
  type CloudDriveAdapter,
} from './cloudDriveAdapter.ts';
import { decodeSyncFile, encodeSyncFile, sortEventsDeterministically } from './codec.ts';
import { applyRemoteEvents, type ApplyResult } from './remoteEventApplier.ts';
import type { LocalStore } from '../domain/localStore.ts';
import { jsonToPayload } from '../domain/mapping.ts';
import type { EventEntry, EventSyncFile, EventType, ExpenseEvent } from '../domain/types.ts';

/** Bound on automatic retries when the remote etag has moved under us. */
const MAX_RETRIES = 3;

export interface SyncEngineDeps {
  readonly store: LocalStore;
  readonly adapter: CloudDriveAdapter;
  readonly userId: string;
  /** Optional: defaults to `true` (matches backend default). */
  readonly compressed?: boolean;
}

export interface SyncResult {
  readonly remote: ApplyResult;
  /** Number of local events uploaded this cycle. */
  readonly uploadedLocal: number;
  /** Whether we actually downloaded — false when the etag was cached and unchanged. */
  readonly downloadedRemote: boolean;
  /** Number of cycle retries due to optimistic-concurrency conflicts. */
  readonly retries: number;
}

export interface SyncEngine {
  performFullSync(): Promise<SyncResult>;
}

/**
 * Build a SyncEngine bound to one (`store`, `adapter`, `userId`) tuple.
 * Construct one per signed-in user and reuse for the lifetime of the
 * session — the closure caches the last-known eTag in memory.
 */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { store, adapter, userId, compressed = true } = deps;
  // Last-known etag for the file in cloud storage. Lets us short-circuit
  // download when the remote hasn't moved.
  let cachedEtag: string | undefined;

  return {
    async performFullSync(): Promise<SyncResult> {
      let attempt = 0;
      while (true) {
        try {
          const result = await runOneCycle();
          return { ...result, retries: attempt };
        } catch (e) {
          if (e instanceof ConcurrencyError && attempt < MAX_RETRIES) {
            attempt += 1;
            // Force a fresh download next round — the cached etag is stale.
            cachedEtag = undefined;
            continue;
          }
          throw e;
        }
      }
    },
  };

  async function runOneCycle(): Promise<Omit<SyncResult, 'retries'>> {
    // ---- 1. Download remote (or skip when etag unchanged) ----------------
    const downloaded = await adapter.download();
    let downloadedRemote = false;
    let remote: ApplyResult = { applied: 0, skipped: 0, errors: 0 };
    let baseEvents: ReadonlyArray<EventEntry> = [];
    let baseSnapshot: EventSyncFile['snapshot'];
    let etag: string | undefined;

    if (downloaded === null) {
      // First sync from this account — no remote file exists yet.
      etag = undefined;
    } else if (downloaded.etag === cachedEtag) {
      // Nothing changed remotely. Still need the bytes for the upload
      // merge step, so decode but skip apply.
      const file = decodeSyncFile(downloaded.bytes, compressed);
      baseEvents = file.events;
      baseSnapshot = file.snapshot;
      etag = downloaded.etag;
    } else {
      const file = decodeSyncFile(downloaded.bytes, compressed);
      baseEvents = file.events;
      baseSnapshot = file.snapshot;
      etag = downloaded.etag;
      downloadedRemote = true;
      remote = await applyRemoteEvents(store, file.events);
    }

    // ---- 2. Collect local uncommitted events --------------------------
    const localUncommitted = await store.findUncommittedEvents(userId);

    // No new local events AND the remote was already applied (or no file
    // existed) → nothing to upload. Cache the etag and exit.
    if (localUncommitted.length === 0) {
      cachedEtag = etag;
      return {
        remote,
        uploadedLocal: 0,
        downloadedRemote,
      };
    }

    // ---- 3. Build the new file payload --------------------------------
    const newEntries = localUncommitted.map(toEventEntry);
    const merged: EventSyncFile = {
      events: sortEventsDeterministically([...baseEvents, ...newEntries]),
      ...(baseSnapshot !== undefined ? { snapshot: baseSnapshot } : {}),
    };
    const bytes = encodeSyncFile(merged, compressed);

    // ---- 4. Upload with optimistic concurrency ------------------------
    // Pass `etag` only when we know one (otherwise the adapter does an
    // unconditional create). A stale etag will surface as ConcurrencyError
    // and the engine's outer loop retries the cycle.
    const upload = etag !== undefined
      ? await adapter.upload(bytes, etag)
      : await adapter.upload(bytes);

    // ---- 5. Mark uploaded events committed locally --------------------
    await store.markEventsCommitted(localUncommitted.map((e) => e.eventId));
    cachedEtag = upload.etag;

    return {
      remote,
      uploadedLocal: localUncommitted.length,
      downloadedRemote,
    };
  }
}

/**
 * Convert a stored `ExpenseEvent` (payload as JSON string) to the wire
 * `EventEntry` shape (payload as object). Mirrors
 * `SyncFileManager.toEventEntry`.
 */
function toEventEntry(event: ExpenseEvent): EventEntry {
  const eventType: EventType = event.eventType;
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    eventType,
    expenseId: event.expenseId,
    payload: jsonToPayload(event.payload),
    userId: event.userId,
  };
}
