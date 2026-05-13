/**
 * Apply remote category events to the local store — the category-aggregate
 * sibling of `remoteEventApplier.ts`.
 *
 * Invariants preserved from the expense pipeline:
 *   - Idempotent: events whose `eventId` is already in `processed_events`
 *     are skipped silently. The registry is shared with expense events —
 *     UUIDs are globally unique so no collision is possible.
 *   - Per-event isolation: a failure on one event logs and continues —
 *     it MUST NOT abort the remaining events.
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

export interface ApplyResult {
  /** Events newly applied (excludes already-processed and errored). */
  readonly applied: number;
  /** Events skipped because already in `processed_events`. */
  readonly skipped: number;
  /** Events that threw during apply. Callers may surface a banner. */
  readonly errors: number;
}

/**
 * Apply each category event to the local store. Iterates in caller-provided
 * order (the engine sorts deterministically before calling this).
 */
export async function applyRemoteCategoryEvents(
  store: LocalStore,
  events: ReadonlyArray<CategoryEventEntry>,
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
      // Log the eventId only — payload may contain user-entered names.
      log.warn(`Failed to apply remote category event ${event.eventId}`, e);
    }
  }

  return { applied, skipped, errors };
}

/**
 * Apply a single event. Returns `true` on apply, `false` when already
 * processed (idempotent skip).
 */
async function applyOneEvent(
  store: LocalStore,
  event: CategoryEventEntry,
): Promise<boolean> {
  // Cheap pre-check outside the transaction. The canonical check is the
  // INSERT inside the transaction (`recordProcessedEvent` uses INSERT OR
  // IGNORE). The pre-check just avoids the BEGIN/COMMIT round-trip for the
  // common already-processed case.
  if (await store.isEventProcessed(event.eventId)) return false;

  return store.transaction(async () => {
    // Re-check inside the transaction — racy without it.
    if (await store.isEventProcessed(event.eventId)) return false;

    await applyByEventType(store, event);
    await store.recordProcessedEvent(event.eventId);
    return true;
  });
}

/** Dispatch on event type — mirrors `applyOneEvent` in `remoteEventApplier`. */
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
