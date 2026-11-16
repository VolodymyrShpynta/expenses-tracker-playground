/**
 * Command-side service for expense write operations (CQRS write side).
 *
 * Direct port of the backend's `ExpenseCommandService`. Each public
 * function runs inside a single SQLite transaction and, on its
 * `tx`-bound store:
 *   1. Re-reads the existing projection (update / delete) and builds a
 *      fresh `ExpensePayload` stamped strictly above it.
 *   2. Appends the event to `expense_events`.
 *   3. Projects (or soft-deletes) the row in `expense_projections`.
 *
 * The transactional boundary is enforced by `LocalStore.transaction`. Do
 * not split these steps across transactions. Splitting 2 from 3
 * recreates the consistency hazard the backend's `@Transactional`
 * annotation prevents. Running 1 earlier lets a sync batch queued ahead
 * of the write re-stamp the row in between, so the strict-`>` check
 * silently rejects a stamp computed from the stale read (and a partial
 * update would copy stale fields over the synced ones).
 *
 * `id` and `eventId` are passed in via `IdGenerator` so tests can inject
 * deterministic ids — same DI principle as `TimeProvider`.
 */
import type { LocalStore } from './localStore';
import { projectPayload, softDelete } from './projector';
import type { ExpenseEvent, ExpensePayload, ExpenseProjection, EventType } from './types';
import type { TimeProvider } from '../utils/time';
import { nextUpdatedAt } from '../utils/time';

export interface IdGenerator {
  /** Returns a fresh UUIDv4 string (lowercase, 36 chars). */
  newUuid(): string;
}

export interface CommandServiceDeps {
  readonly store: LocalStore;
  readonly time: TimeProvider;
  readonly ids: IdGenerator;
  /** JSON serializer (injected so tests can pin formatting). Default: JSON.stringify. */
  readonly serializePayload?: (payload: ExpensePayload) => string;
}

export interface CreateExpenseCommand {
  readonly description: string;
  readonly amount: number;
  readonly currency: string;
  readonly categoryId: string;
  readonly date: string;
}

export interface UpdateExpenseCommand {
  readonly description?: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly categoryId?: string;
  readonly date?: string;
}

export interface ExpenseCommandService {
  createExpense(cmd: CreateExpenseCommand): Promise<ExpenseProjection>;
  updateExpense(id: string, cmd: UpdateExpenseCommand): Promise<ExpenseProjection | undefined>;
  /** `true` when the projection was soft-deleted, `false` when it is absent. */
  deleteExpense(id: string): Promise<boolean>;
}

/**
 * Merge `cmd` over `existing` with command-overrides-existing precedence.
 * Spread-conditional pattern keeps `exactOptionalPropertyTypes` happy:
 * omit the key entirely when the resolved value is `undefined`.
 */
function updatedPayload(
  existing: ExpenseProjection,
  cmd: UpdateExpenseCommand,
  updatedAt: number,
): ExpensePayload {
  const description = cmd.description ?? existing.description;
  const categoryId = cmd.categoryId ?? existing.categoryId;
  const date = cmd.date ?? existing.date;
  return {
    id: existing.id,
    amount: cmd.amount ?? existing.amount,
    currency: cmd.currency ?? existing.currency,
    updatedAt,
    deleted: false,
    ...(description !== undefined ? { description } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(date !== undefined ? { date } : {}),
  };
}

/**
 * DELETED events still carry the last-known payload so peers can
 * resolve resurrection conflicts.
 */
function deletedPayload(existing: ExpenseProjection, updatedAt: number): ExpensePayload {
  return {
    id: existing.id,
    amount: existing.amount,
    currency: existing.currency,
    updatedAt,
    deleted: true,
    ...(existing.description !== undefined ? { description: existing.description } : {}),
    ...(existing.categoryId !== undefined ? { categoryId: existing.categoryId } : {}),
    ...(existing.date !== undefined ? { date: existing.date } : {}),
  };
}

export function createExpenseCommandService(deps: CommandServiceDeps): ExpenseCommandService {
  const { store, time, ids, serializePayload = JSON.stringify } = deps;

  async function appendEventInTx(
    tx: LocalStore,
    eventType: EventType,
    expenseId: string,
    payload: ExpensePayload,
  ): Promise<ExpenseEvent> {
    const event: ExpenseEvent = {
      eventId: ids.newUuid(),
      timestamp: time.nowMs(),
      eventType,
      expenseId,
      payload: serializePayload(payload),
      committed: false,
    };
    await tx.appendEvent(event);
    return event;
  }

  return {
    async createExpense(cmd) {
      const expenseId = ids.newUuid();
      const now = time.nowMs();
      const payload: ExpensePayload = {
        id: expenseId,
        description: cmd.description,
        amount: cmd.amount,
        currency: cmd.currency,
        categoryId: cmd.categoryId,
        date: cmd.date,
        updatedAt: now,
        deleted: false,
      };

      const projection = await store.transaction(async (tx) => {
        await appendEventInTx(tx, 'CREATED', expenseId, payload);
        await projectPayload(tx, payload);
        const stored = await tx.findProjectionById(expenseId);
        if (!stored) {
          throw new Error(`Failed to retrieve created expense projection: ${expenseId}`);
        }
        return stored;
      });

      return projection;
    },

    async updateExpense(id, cmd) {
      return store.transaction(async (tx) => {
        const existing = await tx.findProjectionById(id);
        if (!existing) return undefined;

        // Cap above the existing projection's updatedAt so the strict-`>` LWW
        // UPSERT in `projectFromEvent` never silently drops this write. See
        // `nextUpdatedAt` for the full rationale (synced-from-faster-clock-peer
        // scenario). We still log the wall-clock value as the event's own
        // `timestamp` inside `appendEventInTx`.
        const payload = updatedPayload(existing, cmd, nextUpdatedAt(time, existing.updatedAt));
        await appendEventInTx(tx, 'UPDATED', id, payload);
        await projectPayload(tx, payload);
        return tx.findProjectionById(id);
      });
    },

    async deleteExpense(id) {
      return store.transaction(async (tx) => {
        const existing = await tx.findProjectionById(id);
        if (!existing) return false;

        // See `updateExpense` for the rationale — same LWW skip vector
        // applies to `markAsDeleted`, so cap above existing.updatedAt.
        const now = nextUpdatedAt(time, existing.updatedAt);
        await appendEventInTx(tx, 'DELETED', id, deletedPayload(existing, now));
        return (await softDelete(tx, id, now)) > 0;
      });
    },
  };
}
