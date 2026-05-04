/**
 * Centralized event ↔ projection conversion. Analogue of the backend's
 * `ExpenseMapper` Kotlin object — single source of truth for shape
 * conversions so callers (commands, sync recorder) never map by hand.
 */
import type { EventEntry, ExpensePayload, ExpenseProjection } from './types.ts';

/**
 * Convert an `ExpensePayload` to an `ExpenseProjection` row.
 * Throws if `userId` is missing — projections require a user scope.
 *
 * Mirrors `ExpenseMapper.toProjection()` in the backend, including the
 * default `currency = "USD"` and `amount = 0` fallbacks (which only fire
 * for partial payloads — full create/update flows always set them).
 */
export function payloadToProjection(payload: ExpensePayload): ExpenseProjection {
  if (!payload.userId) {
    throw new Error('userId is required for projection');
  }

  // Build the projection without including `description`/`categoryId`/`date`
  // when the payload omits them, so `exactOptionalPropertyTypes` stays happy.
  const projection: ExpenseProjection = {
    id: payload.id,
    amount: payload.amount ?? 0,
    currency: payload.currency ?? 'USD',
    updatedAt: payload.updatedAt,
    deleted: payload.deleted ?? false,
    userId: payload.userId,
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
    ...(payload.date !== undefined ? { date: payload.date } : {}),
  };
  return projection;
}

/**
 * Convert an `EventEntry` to an `ExpenseProjection`.
 *
 * Falls back to the event-level `userId` when the embedded payload omits
 * one — mirrors `ExpenseMapper.EventEntry.toProjection()`.
 */
export function eventEntryToProjection(entry: EventEntry): ExpenseProjection {
  const effective: ExpensePayload =
    entry.payload.userId === undefined && entry.userId !== undefined
      ? { ...entry.payload, userId: entry.userId }
      : entry.payload;
  return payloadToProjection(effective);
}

/**
 * Parse a JSON string produced by `JSON.stringify(ExpensePayload)` back
 * into an `ExpensePayload`. Centralized so the sync engine and any future
 * caller don't reimplement the cast (and its narrowing). Throws on
 * malformed JSON — caller decides whether to surface or skip.
 */
export function jsonToPayload(json: string): ExpensePayload {
  return JSON.parse(json) as ExpensePayload;
}
