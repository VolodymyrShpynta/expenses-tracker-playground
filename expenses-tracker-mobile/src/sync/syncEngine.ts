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
import { applySnapshot } from './snapshotApply';
import { buildSnapshot, PRUNE_WINDOW_MS } from './snapshotBuilder';
import { shouldRefreshSnapshot, dropCoveredEvents } from './snapshotPolicy';
import type { LocalStore, PruneCommittedEventsResult } from '../domain/localStore';
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
  /**
   * Per-table row counts deleted by the retention prune that runs at
   * the end of every successful cycle. All zero on a steady-state
   * device whose oldest committed events are still inside
   * `PRUNE_WINDOW_MS`.
   */
  readonly pruned: PruneCommittedEventsResult;
}

export interface SyncEngine {
  performFullSync(): Promise<SyncResult>;
}

const EMPTY_APPLY: ApplyResult = { applied: 0, skipped: 0, errors: 0 };
const EMPTY_PRUNE: PruneCommittedEventsResult = {
  expenseEvents: 0,
  categoryEvents: 0,
  processedEvents: 0,
};

/**
 * Subset of `SyncResult` produced by a single cycle. `retries` is set
 * by `performFullSync`'s outer loop, `pruned` by the post-cycle
 * housekeeping step, so neither is part of an individual cycle's
 * return shape.
 */
type CycleResult = Omit<SyncResult, 'retries' | 'pruned'>;

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
          // Prune AFTER a successful cycle so retries on ConcurrencyError
          // don't pile up multiple deletes. Safe because the cutoff is
          // the same window `snapshotBuilder` uses for `coveredEvents` —
          // any row deleted here is guaranteed to be outside the
          // snapshot we just uploaded. Failures don't abort the cycle:
          // we already shipped the user's data, the next sync will
          // retry the prune.
          const pruned = await pruneSafely();
          return { ...result, retries: attempt, pruned };
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

  /**
   * Best-effort retention prune. Pruning is purely a housekeeping
   * operation — the projection is the read model and the cloud already
   * has every committed event, so a failed DELETE never affects
   * correctness. Swallowing the error here keeps a transient SQLite
   * `database is locked` from masking the sync result the caller
   * actually cares about.
   */
  async function pruneSafely(): Promise<PruneCommittedEventsResult> {
    try {
      return await store.pruneCommittedEvents(Date.now() - PRUNE_WINDOW_MS);
    } catch {
      return EMPTY_PRUNE;
    }
  }

  /**
   * One full sync cycle. Picks the cheaper of two paths based on
   * whether anything local is waiting to be uploaded.
   */
  async function runOneCycle(): Promise<CycleResult> {
    // Probe both aggregates in parallel — they share no data dependency
    // and each pays a JS↔native bridge round-trip on Android.
    const [localUncommitted, localUncommittedCategories] = await Promise.all([
      store.findUncommittedEvents(),
      store.findUncommittedCategoryEvents(),
    ]);

    return localUncommitted.length === 0 && localUncommittedCategories.length === 0
      ? runPullOnlyCycle()
      : runMergeAndUploadCycle(localUncommitted, localUncommittedCategories);
  }

  /**
   * Idle path: nothing local to upload, so a conditional download is
   * safe. The common case (auto-sync cold-start / foreground /
   * net-reconnect with no remote changes) short-circuits at the
   * adapter's `not-modified` reply without transferring the body —
   * this is the primary bandwidth saver for auto-syncs.
   */
  async function runPullOnlyCycle(): Promise<CycleResult> {
    const probe =
      cachedEtag !== undefined
        ? await adapter.download({ ifNoneMatch: cachedEtag })
        : await adapter.download();

    if (probe.kind === 'absent') {
      // No remote file and no local writes — nothing to do.
      setCachedEtag(undefined);
      return NO_CHANGES_RESULT;
    }
    if (probe.kind === 'not-modified') {
      // Server confirmed nothing changed since our last sync. Skip
      // both the body transfer and the apply step.
      setCachedEtag(probe.etag);
      return NO_CHANGES_RESULT;
    }
    // probe.kind === 'modified' — apply remote, nothing to push.
    const file = decodeSyncFile(probe.bytes, compressed);
    const { remote, remoteCategories } = await applyRemoteFile(store, file);
    setCachedEtag(probe.etag);
    return {
      remote,
      remoteCategories,
      uploadedLocal: 0,
      uploadedLocalCategories: 0,
      downloadedRemote: true,
    };
  }

  /**
   * Push path: local writes are pending, so we always download
   * unconditionally — we need the bytes for the merge step. Apply
   * anything new the remote has, compose the outgoing file, upload
   * with optimistic eTag, then mark the uploaded events committed.
   */
  async function runMergeAndUploadCycle(
    localUncommitted: ReadonlyArray<ExpenseEvent>,
    localUncommittedCategories: ReadonlyArray<CategoryEvent>,
  ): Promise<CycleResult> {
    const downloaded = await adapter.download();

    // Defensive: we didn't pass ifNoneMatch on this branch, so this
    // shouldn't happen. If an adapter ever returns it anyway, treat it
    // as "remote unchanged" — the simplest safe fallback is to skip
    // the upload this round and let the next cycle start fresh.
    if (downloaded.kind === 'not-modified') {
      setCachedEtag(downloaded.etag);
      return NO_CHANGES_RESULT;
    }

    // Resolve the merge base + decide whether to apply remote events.
    let base: OutgoingBase = { events: [], categoryEvents: [], snapshot: undefined };
    let etag: string | undefined;
    let remote: ApplyResult = EMPTY_APPLY;
    let remoteCategories: ApplyResult = EMPTY_APPLY;
    let downloadedRemote = false;

    if (downloaded.kind === 'absent') {
      // First sync from this account — no remote file exists yet.
      etag = undefined;
    } else if (downloaded.etag === cachedEtag) {
      // Remote bytes match what we already applied. Skip the apply
      // step (events are already in `processed_events`) but keep the
      // decoded base for the upload merge.
      const file = decodeSyncFile(downloaded.bytes, compressed);
      base = { events: file.events, categoryEvents: file.categoryEvents, snapshot: file.snapshot };
      etag = downloaded.etag;
    } else {
      const file = decodeSyncFile(downloaded.bytes, compressed);
      base = { events: file.events, categoryEvents: file.categoryEvents, snapshot: file.snapshot };
      etag = downloaded.etag;
      downloadedRemote = true;
      ({ remote, remoteCategories } = await applyRemoteFile(store, file));
    }

    const merged = await buildOutgoingFile(
      store,
      base,
      localUncommitted,
      localUncommittedCategories,
    );
    const bytes = encodeSyncFile(merged, compressed);

    // Pass `etag` only when we know one (otherwise the adapter does an
    // unconditional create). A stale etag will surface as
    // ConcurrencyError and the engine's outer loop retries the cycle.
    const upload =
      etag !== undefined
        ? await adapter.upload(bytes, etag)
        : await adapter.upload(bytes);

    await markLocalEventsCommitted(
      store,
      localUncommitted,
      localUncommittedCategories,
    );
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

/** Sentinel return value for cycles that decided to do nothing. */
const NO_CHANGES_RESULT: CycleResult = {
  remote: EMPTY_APPLY,
  remoteCategories: EMPTY_APPLY,
  uploadedLocal: 0,
  uploadedLocalCategories: 0,
  downloadedRemote: false,
};

/** The three "remote file" inputs that compose into the merge step. */
interface OutgoingBase {
  readonly events: ReadonlyArray<EventEntry>;
  readonly categoryEvents: ReadonlyArray<CategoryEventEntry>;
  readonly snapshot: EventSyncFile['snapshot'];
}

/**
 * Apply a decoded remote file to the local store. Order is snapshot →
 * categories → expenses:
 *
 * - Snapshot first so the per-event applier sees pre-populated
 *   projections + `processed_events` and most historical events become
 *   cheap no-ops. Snapshot is purely an optimization; semantic
 *   correctness is unchanged.
 * - Categories before expenses so any expense projection that
 *   references a brand-new category sees the row in place — otherwise
 *   the UI briefly shows an orphan-placeholder name/icon until the
 *   next refresh.
 */
async function applyRemoteFile(
  store: LocalStore,
  file: EventSyncFile,
): Promise<{ remote: ApplyResult; remoteCategories: ApplyResult }> {
  if (file.snapshot !== undefined) {
    await applySnapshot(store, file.snapshot);
  }
  const remoteCategories = await applyRemoteCategoryEvents(store, file.categoryEvents);
  const remote = await applyRemoteEvents(store, file.events);
  return { remote, remoteCategories };
}

/**
 * Compose the EventSyncFile we'll upload this cycle:
 *
 * 1. Merge base remote events with local uncommitted ones, sorted
 *    deterministically (`(timestamp ASC, eventId ASC)`).
 * 2. Decide whether to refresh the embedded snapshot. Refresh fires
 *    when enough events have piled up past the base snapshot's cutoff
 *    (or there is no snapshot yet); otherwise we reuse the base
 *    snapshot to keep idle uploads payload-stable. `buildSnapshot`
 *    runs after the apply step so it captures freshly-applied remote
 *    events alongside local-only ones.
 * 3. Drop events whose IDs are already captured by the resulting
 *    snapshot. Runs on every cycle — not just on refresh — so
 *    partially-applied cycles self-heal: a covered event can never
 *    re-enter the body.
 */
async function buildOutgoingFile(
  store: LocalStore,
  base: OutgoingBase,
  localUncommitted: ReadonlyArray<ExpenseEvent>,
  localUncommittedCategories: ReadonlyArray<CategoryEvent>,
): Promise<EventSyncFile> {
  const mergedEvents = sortEventsDeterministically([
    ...base.events,
    ...localUncommitted.map(toEventEntry),
  ]);
  const mergedCategoryEvents = sortCategoryEventsDeterministically([
    ...base.categoryEvents,
    ...localUncommittedCategories.map(toCategoryEventEntry),
  ]);

  const nextSnapshot = shouldRefreshSnapshot(
    base.snapshot,
    mergedEvents,
    mergedCategoryEvents,
  )
    ? await buildSnapshot(store)
    : base.snapshot;

  const coveredEvents = nextSnapshot?.coveredEvents ?? [];
  return {
    events: dropCoveredEvents(mergedEvents, coveredEvents),
    categoryEvents: dropCoveredEvents(mergedCategoryEvents, coveredEvents),
    ...(nextSnapshot !== undefined ? { snapshot: nextSnapshot } : {}),
  };
}

/** Mark local uncommitted events (both aggregates) as committed. */
async function markLocalEventsCommitted(
  store: LocalStore,
  localUncommitted: ReadonlyArray<ExpenseEvent>,
  localUncommittedCategories: ReadonlyArray<CategoryEvent>,
): Promise<void> {
  if (localUncommitted.length > 0) {
    await store.markEventsCommitted(localUncommitted.map((e) => e.eventId));
  }
  if (localUncommittedCategories.length > 0) {
    await store.markCategoryEventsCommitted(
      localUncommittedCategories.map((e) => e.eventId),
    );
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
