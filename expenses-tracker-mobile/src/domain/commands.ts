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
 * `userId`, `id`, and `eventId` are passed in via `IdGenerator` so tests
 * can inject deterministic ids — same DI principle as `TimeProvider`.
 */
import type { LocalStore } from './localStore';
import { payloadToProjection } from './mapping';
import type { ExpenseEvent, ExpensePayload, ExpenseProjection, EventType } from './types';
import type { TimeProvider } from '../utils/time';

export interface IdGenerator {
  /** Returns a fresh UUIDv4 string (lowercase, 36 chars). */
  newUuid(): string;
}

export interface CommandServiceDeps {
  readonly store: LocalStore;
  readonly time: TimeProvider;
  readonly ids: IdGenerator;
  readonly userId: string;
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
  const { store, time, ids, userId, serializePayload = JSON.stringify } = deps;

  async function appendEventInTx(
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
      userId,
    };
    await store.appendEvent(event);
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
        userId,
      };

      const projection = await store.transaction(async () => {
        await appendEventInTx('CREATED', expenseId, payload);
        await store.projectFromEvent(payloadToProjection(payload));
        const stored = await store.findProjectionById(expenseId, userId);
        if (!stored) {
          throw new Error(`Failed to retrieve created expense projection: ${expenseId}`);
        }
        return stored;
      });

      return projection;
    },

    async updateExpense(id, cmd) {
      const existing = await store.findProjectionById(id, userId);
      if (!existing) return undefined;

      const now = time.nowMs();
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
        userId,
        ...(description !== undefined ? { description } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(date !== undefined ? { date } : {}),
      };

      return store.transaction(async () => {
        await appendEventInTx('UPDATED', id, payload);
        await store.projectFromEvent(payloadToProjection(payload));
        return store.findProjectionById(id, userId);
      });
    },

    async deleteExpense(id) {
      const existing = await store.findProjectionById(id, userId);
      if (!existing) return false;

      const now = time.nowMs();
      // DELETED events still carry the last-known payload so peers can
      // resolve resurrection conflicts. Spread-conditional pattern handles
      // optional fields under `exactOptionalPropertyTypes`.
      const payload: ExpensePayload = {
        id,
        amount: existing.amount,
        currency: existing.currency,
        updatedAt: now,
        deleted: true,
        userId,
        ...(existing.description !== undefined ? { description: existing.description } : {}),
        ...(existing.categoryId !== undefined ? { categoryId: existing.categoryId } : {}),
        ...(existing.date !== undefined ? { date: existing.date } : {}),
      };

      return store.transaction(async () => {
        await appendEventInTx('DELETED', id, payload);
        await store.markAsDeleted(id, now);
        return true;
      });
    },
  };
}
