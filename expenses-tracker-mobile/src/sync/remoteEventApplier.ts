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
 *     it MUST NOT abort the remaining events.
 *   - Atomic apply: each successful application runs `projection update`
 *     + `processed_events insert` inside a single transaction so a crash
 *     mid-apply leaves the store consistent.
 *   - Conflict semantics:
 *       CREATED, UPDATED → `projectFromEvent` (LWW UPSERT, strict `>` on `updated_at`)
 *       DELETED         → `markAsDeleted(payload.updatedAt)` (only transitions to deleted)
 *
 * Logging never includes payload contents — same PII rule as the backend.
 */
import type { LocalStore } from '../domain/localStore.ts';
import { eventEntryToProjection } from '../domain/mapping.ts';
import type { EventEntry, EventType } from '../domain/types.ts';

export interface ApplyResult {
  /** Events newly applied (excludes already-processed and errored). */
  readonly applied: number;
  /** Events skipped because already in `processed_events`. */
  readonly skipped: number;
  /** Events that threw during apply. Callers may surface a banner. */
  readonly errors: number;
}

/**
 * Apply each event to the local store. Iterates in caller-provided order
 * (the engine sorts deterministically before calling this).
 */
export async function applyRemoteEvents(
  store: LocalStore,
  events: ReadonlyArray<EventEntry>,
  log: { warn: (msg: string, ...args: unknown[]) => void } = console,
): Promise<ApplyResult> {
  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const event of events) {
    try {
      const wasApplied = await applyOneEvent(store, event);
      if (wasApplied) applied += 1;
      else skipped += 1;
    } catch (e) {
      errors += 1;
      // Log the eventId only — payload may contain user-entered descriptions.
      log.warn(`Failed to apply remote event ${event.eventId}`, e);
    }
  }

  return { applied, skipped, errors };
}

/**
 * Apply a single event. Returns `true` on apply, `false` when already
 * processed (idempotent skip).
 */
async function applyOneEvent(store: LocalStore, event: EventEntry): Promise<boolean> {
  // Cheap pre-check outside the transaction — the canonical check is the
  // INSERT inside the transaction (`recordProcessedEvent` uses INSERT OR
  // IGNORE). The pre-check just lets us avoid the BEGIN/COMMIT round-trip
  // for the common already-processed case.
  if (await store.isEventProcessed(event.eventId)) return false;

  return store.transaction(async () => {
    // Re-check inside the transaction — racy without it.
    if (await store.isEventProcessed(event.eventId)) return false;

    await projectByEventType(store, event);
    await store.recordProcessedEvent(event.eventId);
    return true;
  });
}

/** Dispatch on event type — mirrors `ExpenseSyncRecorder.projectExpenseFromEvent`. */
async function projectByEventType(store: LocalStore, event: EventEntry): Promise<void> {
  const eventType: EventType = event.eventType;
  switch (eventType) {
    case 'CREATED':
    case 'UPDATED':
      await store.projectFromEvent(eventEntryToProjection(event));
      return;
    case 'DELETED':
      await store.markAsDeleted(event.expenseId, event.payload.updatedAt);
      return;
  }
}
