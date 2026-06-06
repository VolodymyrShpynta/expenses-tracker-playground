/**
 * Command-side service for expense write operations (CQRS write side).
 *
 * Direct port of the backend's `ExpenseCommandService`. Each public
 * function:
 *   1. Loads the existing projection (when applicable).
 *   2. Builds a fresh `ExpensePayload` with `updatedAt = time.nowMs()`.
 *   3. Inside a single SQLite transaction:
 *        a. Appends the event to `expense_events`.
 *        b. Projects (or soft-deletes) the row in `expense_projections`.
 *
 * The transactional boundary is enforced by `LocalStore.transaction`. Do
 * not split steps 3a and 3b across separate transactions — that would
 * recreate the consistency hazard the backend's `@Transactional` annotation
 * prevents.
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
  deleteExpense(id: string): Promise<boolean>;
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
      const existing = await store.findProjectionById(id);
      if (!existing) return undefined;

      // Cap above the existing projection's updatedAt so the strict-`>` LWW
      // UPSERT in `projectFromEvent` never silently drops this write. See
      // `nextUpdatedAt` for the full rationale (synced-from-faster-clock-peer
      // scenario). We still log the wall-clock value as the event's own
      // `timestamp` inside `appendEventInTx`.
      const now = nextUpdatedAt(time, existing.updatedAt);
      // Resolve optional fields with command-overrides-existing precedence.
      // Spread-conditional pattern keeps `exactOptionalPropertyTypes` happy:
      // omit the key entirely when the resolved value is `undefined`.
      const description = cmd.description ?? existing.description;
      const categoryId = cmd.categoryId ?? existing.categoryId;
      const date = cmd.date ?? existing.date;
      const payload: ExpensePayload = {
        id,
        amount: cmd.amount ?? existing.amount,
        currency: cmd.currency ?? existing.currency,
        updatedAt: now,
        deleted: false,
        ...(description !== undefined ? { description } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(date !== undefined ? { date } : {}),
      };

      return store.transaction(async (tx) => {
        await appendEventInTx(tx, 'UPDATED', id, payload);
        await projectPayload(tx, payload);
        return tx.findProjectionById(id);
      });
    },

    async deleteExpense(id) {
      const existing = await store.findProjectionById(id);
      if (!existing) return false;

      // See `updateExpense` for the rationale — same LWW skip vector
      // applies to `markAsDeleted`, so cap above existing.updatedAt.
      const now = nextUpdatedAt(time, existing.updatedAt);
      // DELETED events still carry the last-known payload so peers can
      // resolve resurrection conflicts. Spread-conditional pattern handles
      // optional fields under `exactOptionalPropertyTypes`.
      const payload: ExpensePayload = {
        id,
        amount: existing.amount,
        currency: existing.currency,
        updatedAt: now,
        deleted: true,
        ...(existing.description !== undefined ? { description: existing.description } : {}),
        ...(existing.categoryId !== undefined ? { categoryId: existing.categoryId } : {}),
        ...(existing.date !== undefined ? { date: existing.date } : {}),
      };

      return store.transaction(async (tx) => {
        await appendEventInTx(tx, 'DELETED', id, payload);
        await softDelete(tx, id, now);
        return true;
      });
    },
  };
}
