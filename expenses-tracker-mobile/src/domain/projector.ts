/**
 * Project an event onto the local read model.
 *
 * This module is a TypeScript port of the backend SQL UPSERT in
 * `ExpenseProjectionRepository.projectFromEvent` and `markAsDeleted`.
 *
 * Conflict-resolution rule (uniformly applied to CREATED, UPDATED, DELETED):
 *   The incoming projection wins iff its `updatedAt` is **strictly greater**
 *   than the stored row's `updatedAt`. Equal timestamps are rejected
 *   (matches the backend's `WHERE EXCLUDED.updated_at > expense_projections.updated_at`).
 *
 * Soft deletes (`deleted=true`) can be superseded by a newer non-deleted
 * update (resurrection). The `markAsDeleted` helper, by contrast, can ONLY
 * transition to deleted — never resurrect.
 *
 * The actual SQL UPSERT lives in the `LocalStore` implementation; this
 * module is the documented home of the rule and the place tests assert
 * against. Splitting projector behaviour from storage matches the backend's
 * `ExpenseSyncProjector` / `ExpenseSyncRecorder` separation.
 */
import type { LocalStore } from './localStore';
import { eventEntryToProjection, payloadToProjection } from './mapping';
import type { EventEntry, ExpensePayload } from './types';

/**
 * Apply a payload (e.g. produced by the local command service) to the
 * projection table. Returns the number of rows affected — `0` means the
 * incoming row lost the last-write-wins comparison.
 */
export async function projectPayload(
  store: LocalStore,
  payload: ExpensePayload,
): Promise<number> {
  return store.projectFromEvent(payloadToProjection(payload));
}

/**
 * Apply an event entry (typically read from a remote sync file) to the
 * projection table. Returns the number of rows affected.
 */
export async function projectEventEntry(
  store: LocalStore,
  entry: EventEntry,
): Promise<number> {
  return store.projectFromEvent(eventEntryToProjection(entry));
}

/**
 * Soft-delete shortcut for the local command path. Equivalent to
 * `projectPayload` with `deleted=true`, but uses the dedicated
 * `markAsDeleted` SQL on the store — same as the backend.
 */
export async function softDelete(
  store: LocalStore,
  id: string,
  updatedAt: number,
): Promise<number> {
  return store.markAsDeleted(id, updatedAt);
}
