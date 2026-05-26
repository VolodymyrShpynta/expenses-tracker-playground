/**
 * Apply remote category events to the local store — the category-aggregate
 * sibling of `remoteEventApplier.ts`.
 *
 * Invariants preserved from the expense pipeline:
 *   - Idempotent: events whose `eventId` is already in `processed_events`
 *     are skipped silently. The registry is shared with expense events —
 *     UUIDs are globally unique so no collision is possible.
 *   - Per-event isolation: a failure on one event logs and continues —
 *     it MUST NOT abort the remaining events. (Implemented as per-chunk
 *     fast path with per-event fallback on chunk failure — see
 *     `batchApply.ts`.)
 *   - Atomic apply: each successful application runs `category project`
 *     + `processed_events insert` inside a single transaction so a crash
 *     mid-apply leaves the store consistent.
 *   - Conflict semantics:
 *       CREATED, UPDATED → `projectCategoryFromEvent` (LWW UPSERT, strict
 *                          `>` on `updated_at`)
 *       DELETED         → `softDeleteCategory(payload.updatedAt)` (only
 *                          transitions to deleted, never resurrects)
 *
 * Logging never includes payload contents — same PII rule as the backend.
 */
import type { LocalStore } from '../domain/localStore';
import { categoryEventEntryToCategory } from '../domain/mapping';
import type { CategoryEventEntry, EventType } from '../domain/types';
import { applyEventsBatched, type ApplyResult, type BatchApplyLog } from './batchApply';

export type { ApplyResult } from './batchApply';

/**
 * Apply each category event to the local store. Iterates in caller-provided
 * order (the engine sorts deterministically before calling this).
 *
 * Events are applied in chunked transactions for throughput; see
 * `batchApply.ts` for the exact semantics.
 */
export async function applyRemoteCategoryEvents(
  store: LocalStore,
  events: ReadonlyArray<CategoryEventEntry>,
  log: BatchApplyLog = console,
): Promise<ApplyResult> {
  return applyEventsBatched(
    store,
    events,
    (event) => event.eventId,
    (event) => applyByEventType(store, event),
    'remote category event',
    log,
  );
}

/** Dispatch on event type — mirrors `applyByEventType` in the expense applier. */
async function applyByEventType(
  store: LocalStore,
  event: CategoryEventEntry,
): Promise<void> {
  const eventType: EventType = event.eventType;
  switch (eventType) {
    case 'CREATED':
    case 'UPDATED':
      await store.projectCategoryFromEvent(categoryEventEntryToCategory(event));
      return;
    case 'DELETED': {
      await store.softDeleteCategory(
        event.categoryId,
        event.payload.updatedAt,
      );
      return;
    }
  }
}
