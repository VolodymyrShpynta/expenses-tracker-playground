/**
 * Apply remote events to the local store — port of the backend's
 * `RemoteEventProcessor` + `ExpenseSyncProjector` + `ExpenseSyncRecorder`
 * trio, collapsed to a single module since mobile has no Spring proxy
 * pitfall (the backend split was driven by `@Transactional` self-invocation,
 * not by domain concerns).
 *
 * Invariants preserved verbatim from the backend:
 *   - Idempotent: events whose `eventId` is already in `processed_events`
 *     are skipped silently.
 *   - Per-event isolation: a failure on one event logs and continues —
 *     it MUST NOT abort the remaining events. (Implemented as per-chunk
 *     fast path with per-event fallback on chunk failure — see
 *     `batchApply.ts`.)
 *   - Atomic apply: each successful application runs `projection update`
 *     + `processed_events insert` inside a single transaction so a crash
 *     mid-apply leaves the store consistent.
 *   - Conflict semantics:
 *       CREATED, UPDATED → `projectFromEvent` (LWW UPSERT, strict `>` on `updated_at`)
 *       DELETED         → `markAsDeleted(payload.updatedAt)` (only transitions to deleted)
 *
 * Logging never includes payload contents — same PII rule as the backend.
 */
import type { LocalStore } from '../domain/localStore';
import { projectEventEntry, softDelete } from '../domain/projector';
import type { EventEntry, EventType } from '../domain/types';
import { applyEventsBatched, type ApplyResult, type BatchApplyLog } from './batchApply';

export type { ApplyResult } from './batchApply';

/**
 * Apply each event to the local store. Iterates in caller-provided order
 * (the engine sorts deterministically before calling this).
 *
 * Events are applied in chunked transactions for throughput; see
 * `batchApply.ts` for the exact semantics.
 */
export async function applyRemoteEvents(
  store: LocalStore,
  events: ReadonlyArray<EventEntry>,
  log: BatchApplyLog = console,
): Promise<ApplyResult> {
  return applyEventsBatched(
    store,
    events,
    (event) => event.eventId,
    (event) => event.timestamp,
    (event) => projectByEventType(store, event),
    'remote event',
    log,
  );
}

/** Dispatch on event type — mirrors `ExpenseSyncRecorder.projectExpenseFromEvent`. */
async function projectByEventType(store: LocalStore, event: EventEntry): Promise<void> {
  const eventType: EventType = event.eventType;
  switch (eventType) {
    case 'CREATED':
    case 'UPDATED':
      await projectEventEntry(store, event);
      return;
    case 'DELETED':
      await softDelete(store, event.expenseId, event.payload.updatedAt);
      return;
  }
}
