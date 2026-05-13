/**
 * Centralized event ↔ projection conversion. Analogue of the backend's
 * `ExpenseMapper` Kotlin object — single source of truth for shape
 * conversions so callers (commands, sync recorder) never map by hand.
 */
import type {
  Category,
  CategoryEventEntry,
  CategoryPayload,
  EventEntry,
  ExpensePayload,
  ExpenseProjection,
} from './types';

/**
 * Convert an `ExpensePayload` to an `ExpenseProjection` row.
 *
 * Mirrors `ExpenseMapper.toProjection()` in the backend, including the
 * default `currency = "USD"` and `amount = 0` fallbacks (which only fire
 * for partial payloads — full create/update flows always set them).
 */
export function payloadToProjection(payload: ExpensePayload): ExpenseProjection {
  // Build the projection without including `description`/`categoryId`/`date`
  // when the payload omits them, so `exactOptionalPropertyTypes` stays happy.
  const projection: ExpenseProjection = {
    id: payload.id,
    amount: payload.amount ?? 0,
    currency: payload.currency ?? 'USD',
    updatedAt: payload.updatedAt,
    deleted: payload.deleted ?? false,
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
    ...(payload.date !== undefined ? { date: payload.date } : {}),
  };
  return projection;
}

/** Convert an `EventEntry` to an `ExpenseProjection`. */
export function eventEntryToProjection(entry: EventEntry): ExpenseProjection {
  return payloadToProjection(entry.payload);
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

/**
 * Convert a `CategoryPayload` to a `Category` row.
 *
 * Mirrors `payloadToProjection` for the category aggregate.
 */
export function categoryPayloadToCategory(payload: CategoryPayload): Category {
  return {
    id: payload.id,
    icon: payload.icon,
    color: payload.color,
    sortOrder: payload.sortOrder,
    updatedAt: payload.updatedAt,
    deleted: payload.deleted ?? false,
    ...(payload.name !== undefined ? {name: payload.name} : {}),
    ...(payload.templateKey !== undefined ? {templateKey: payload.templateKey} : {}),
  };
}

/** Convert a `CategoryEventEntry` to a `Category` row. */
export function categoryEventEntryToCategory(entry: CategoryEventEntry): Category {
  return categoryPayloadToCategory(entry.payload);
}

/**
 * Parse a JSON string produced by `JSON.stringify(CategoryPayload)` back
 * into a `CategoryPayload`. Mirrors `jsonToPayload` for categories.
 */
export function jsonToCategoryPayload(json: string): CategoryPayload {
  return JSON.parse(json) as CategoryPayload;
}
