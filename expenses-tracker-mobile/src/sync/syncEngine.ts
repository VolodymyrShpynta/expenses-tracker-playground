/**
 * Sync engine — orchestrates the full sync cycle for both expense and
 * category aggregates.
 *
 * Direct port of the backend's `ExpenseEventSyncService.performFullSync`,
 * adapted for cloud drives instead of a local file path:
 *
 *   1. Probe the local store for uncommitted events. If there's nothing
 *      to upload AND we have a cached etag, ask the adapter for a
 *      conditional download (`If-None-Match`). When the remote is
 *      unchanged, the adapter returns `not-modified` without
 *      transferring the body — this is the primary bandwidth saver for
 *      idle auto-syncs (cold start, foreground, net reconnect, …).
 *   2. Otherwise download the file unconditionally (we need the bytes
 *      for the merge step).
 *   3. Decode + apply all events through `applyRemoteEvents` and
 *      `applyRemoteCategoryEvents` (both idempotent).
 *   4. Collect local uncommitted events + category events; merge into the
 *      file payload; upload with `If-Match` set to the etag we downloaded.
 *   5. Mark uploaded events committed locally and cache the new etag.
 *
 * Order on apply: categories first, then expenses. New category rows must
 * exist before any expense referencing them is projected, otherwise the
 * UI shows orphan placeholders until the next refresh.
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
} from './cloudDriveAdapter';
import {
  decodeSyncFile,
  encodeSyncFile,
  sortCategoryEventsDeterministically,
  sortEventsDeterministically,
} from './codec';
import { applyRemoteEvents, type ApplyResult } from './remoteEventApplier';
import { applyRemoteCategoryEvents } from './remoteCategoryEventApplier';
import type { LocalStore } from '../domain/localStore';
import { jsonToCategoryPayload, jsonToPayload } from '../domain/mapping';
import type {
  CategoryEvent,
  CategoryEventEntry,
  EventEntry,
  EventSyncFile,
  EventType,
  ExpenseEvent,
} from '../domain/types';

/** Bound on automatic retries when the remote etag has moved under us. */
const MAX_RETRIES = 3;

export interface SyncEngineDeps {
  readonly store: LocalStore;
  readonly adapter: CloudDriveAdapter;
  /** Optional: defaults to `true` (matches backend default). */
  readonly compressed?: boolean;
  /**
   * Seed for the in-closure `cachedEtag`. Pass the last etag observed for
   * this `(provider, account)` pair so the very first sync after a cold
   * start can still use `If-None-Match` and short-circuit when nothing
   * changed remotely. Defaults to `undefined` (no seed) — the engine then
   * does one unconditional download on the first idle cycle, exactly like
   * before persistence was wired up.
   */
  readonly initialEtag?: string;
  /**
   * Invoked whenever the engine's `cachedEtag` actually changes value
   * (skipped for no-op writes). Callers persist the new value — typically
   * to `AsyncStorage` keyed per provider — so the next cold start can
   * pass it back via `initialEtag`. Receives `undefined` when the engine
   * deliberately invalidates the cache (concurrency conflict, remote
   * file disappeared, …). Errors thrown by the callback are not caught;
   * keep it fire-and-forget on the caller side.
   */
  readonly onEtagChange?: (etag: string | undefined) => void;
}

export interface SyncResult {
  readonly remote: ApplyResult;
  /** Apply result for the category-aggregate sub-stream. */
  readonly remoteCategories: ApplyResult;
  /** Number of local expense events uploaded this cycle. */
  readonly uploadedLocal: number;
  /** Number of local category events uploaded this cycle. */
  readonly uploadedLocalCategories: number;
  /** Whether we actually downloaded — false when the etag was cached and unchanged. */
  readonly downloadedRemote: boolean;
  /** Number of cycle retries due to optimistic-concurrency conflicts. */
  readonly retries: number;
}

export interface SyncEngine {
  performFullSync(): Promise<SyncResult>;
}

const EMPTY_APPLY: ApplyResult = { applied: 0, skipped: 0, errors: 0 };

/**
 * Build a SyncEngine bound to one (`store`, `adapter`) pair.
 * Construct one per app session and reuse for its lifetime — the closure
 * caches the last-known eTag in memory.
 */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { store, adapter, compressed = true, initialEtag, onEtagChange } = deps;
  // Last-known etag for the file in cloud storage. Lets us short-circuit
  // the download body when the remote hasn't moved (see `If-None-Match`
  // path in `runOneCycle`). Seeded from `initialEtag` so that a fresh
  // engine after a cold start can still revalidate against the remote
  // without re-downloading the whole file.
  let cachedEtag: string | undefined = initialEtag;

  /**
   * Single write-path for `cachedEtag`. Fires `onEtagChange` only when
   * the value actually changes — avoids spamming the persistence layer
   * on every cycle when nothing moved.
   */
  function setCachedEtag(value: string | undefined): void {
    if (cachedEtag === value) return;
    cachedEtag = value;
    onEtagChange?.(value);
  }

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
            setCachedEtag(undefined);
            continue;
          }
          throw e;
        }
      }
    },
  };

  async function runOneCycle(): Promise<Omit<SyncResult, 'retries'>> {
    // ---- 1. Probe local store first ----------------------------------
    // Knowing up front whether we have anything to upload lets us pick
    // the cheaper download path: with `ifNoneMatch` when we're just
    // pulling, without it when we'll need the bytes for a merge.
    const localUncommitted = await store.findUncommittedEvents();
    const localUncommittedCategories =
      await store.findUncommittedCategoryEvents();
    const hasLocalWrites =
      localUncommitted.length > 0 || localUncommittedCategories.length > 0;

    // ---- 2. Conditional download (no upload pending) -----------------
    if (!hasLocalWrites) {
      const probe =
        cachedEtag !== undefined
          ? await adapter.download({ ifNoneMatch: cachedEtag })
          : await adapter.download();

      if (probe.kind === 'absent') {
        // No remote file and no local writes — nothing to do.
        setCachedEtag(undefined);
        return {
          remote: EMPTY_APPLY,
          remoteCategories: EMPTY_APPLY,
          uploadedLocal: 0,
          uploadedLocalCategories: 0,
          downloadedRemote: false,
        };
      }
      if (probe.kind === 'not-modified') {
        // Server confirmed nothing changed since our last sync. Skip
        // both the body transfer and the apply step.
        setCachedEtag(probe.etag);
        return {
          remote: EMPTY_APPLY,
          remoteCategories: EMPTY_APPLY,
          uploadedLocal: 0,
          uploadedLocalCategories: 0,
          downloadedRemote: false,
        };
      }
      // probe.kind === 'modified' — apply but don't upload (nothing to push).
      const file = decodeSyncFile(probe.bytes, compressed);
      const remoteCategories = await applyRemoteCategoryEvents(
        store,
        file.categoryEvents,
      );
      const remote = await applyRemoteEvents(store, file.events);
      setCachedEtag(probe.etag);
      return {
        remote,
        remoteCategories,
        uploadedLocal: 0,
        uploadedLocalCategories: 0,
        downloadedRemote: true,
      };
    }

    // ---- 3. Full download (local writes pending — we need the bytes) -
    const downloaded = await adapter.download();
    let downloadedRemote = false;
    let remote: ApplyResult = EMPTY_APPLY;
    let remoteCategories: ApplyResult = EMPTY_APPLY;
    let baseEvents: ReadonlyArray<EventEntry> = [];
    let baseCategoryEvents: ReadonlyArray<CategoryEventEntry> = [];
    let baseSnapshot: EventSyncFile['snapshot'];
    let etag: string | undefined;

    if (downloaded.kind === 'absent') {
      // First sync from this account — no remote file exists yet.
      etag = undefined;
    } else if (downloaded.kind === 'not-modified') {
      // Defensive: we didn't pass ifNoneMatch on this branch, so this
      // shouldn't happen. If an adapter ever returns it anyway, treat it
      // as "remote unchanged" — we still need to walk our base from
      // whatever we last knew, which means refusing the cycle. The
      // simplest safe fallback is to skip the upload this round.
      setCachedEtag(downloaded.etag);
      return {
        remote: EMPTY_APPLY,
        remoteCategories: EMPTY_APPLY,
        uploadedLocal: 0,
        uploadedLocalCategories: 0,
        downloadedRemote: false,
      };
    } else if (downloaded.etag === cachedEtag) {
      // Remote bytes match what we already applied. Skip the apply step
      // (events are already in `processed_events`) but keep the decoded
      // base events for the upload merge.
      const file = decodeSyncFile(downloaded.bytes, compressed);
      baseEvents = file.events;
      baseCategoryEvents = file.categoryEvents;
      baseSnapshot = file.snapshot;
      etag = downloaded.etag;
    } else {
      const file = decodeSyncFile(downloaded.bytes, compressed);
      baseEvents = file.events;
      baseCategoryEvents = file.categoryEvents;
      baseSnapshot = file.snapshot;
      etag = downloaded.etag;
      downloadedRemote = true;
      // Apply categories BEFORE expenses so any expense projection that
      // references a brand-new category sees the row in place.
      remoteCategories = await applyRemoteCategoryEvents(store, baseCategoryEvents);
      remote = await applyRemoteEvents(store, file.events);
    }

    // ---- 4. Build the new file payload --------------------------------
    const newEntries = localUncommitted.map(toEventEntry);
    const newCategoryEntries = localUncommittedCategories.map(toCategoryEventEntry);
    const merged: EventSyncFile = {
      events: sortEventsDeterministically([...baseEvents, ...newEntries]),
      categoryEvents: sortCategoryEventsDeterministically([
        ...baseCategoryEvents,
        ...newCategoryEntries,
      ]),
      ...(baseSnapshot !== undefined ? { snapshot: baseSnapshot } : {}),
    };
    const bytes = encodeSyncFile(merged, compressed);

    // ---- 5. Upload with optimistic concurrency ------------------------
    // Pass `etag` only when we know one (otherwise the adapter does an
    // unconditional create). A stale etag will surface as ConcurrencyError
    // and the engine's outer loop retries the cycle.
    const upload = etag !== undefined
      ? await adapter.upload(bytes, etag)
      : await adapter.upload(bytes);

    // ---- 6. Mark uploaded events committed locally --------------------
    if (localUncommitted.length > 0) {
      await store.markEventsCommitted(localUncommitted.map((e) => e.eventId));
    }
    if (localUncommittedCategories.length > 0) {
      await store.markCategoryEventsCommitted(
        localUncommittedCategories.map((e) => e.eventId),
      );
    }
    setCachedEtag(upload.etag);

    return {
      remote,
      remoteCategories,
      uploadedLocal: localUncommitted.length,
      uploadedLocalCategories: localUncommittedCategories.length,
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
  };
}

/**
 * Convert a stored `CategoryEvent` (payload as JSON string) to the wire
 * `CategoryEventEntry` shape (payload as object). Mirrors `toEventEntry`
 * for the category aggregate.
 */
function toCategoryEventEntry(event: CategoryEvent): CategoryEventEntry {
  const eventType: EventType = event.eventType;
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    eventType,
    categoryId: event.categoryId,
    payload: jsonToCategoryPayload(event.payload),
  };
}
