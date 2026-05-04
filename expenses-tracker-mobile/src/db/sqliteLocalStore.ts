/**
 * SQLite-backed `LocalStore` for the mobile event-sourcing core.
 *
 * Direct counterpart of the backend's R2DBC repositories
 * (`ExpenseEventRepository`, `ExpenseProjectionRepository`). The
 * last-write-wins UPSERT and the strict `>` timestamp rule are preserved
 * verbatim — see `ExpenseProjectionRepositoryTest` for the canonical
 * behavior matrix.
 *
 * NOT covered by Vitest: this module loads `expo-sqlite`, which is a
 * native module. It is exercised at runtime via the Expo dev client and
 * indirectly through the in-memory `InMemoryLocalStore` test double in
 * `src/test/inMemoryLocalStore.ts` (which mirrors the same semantics).
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { LocalStore, TransactionRunner } from '../domain/localStore.ts';
import type { ExpenseEvent, ExpenseProjection, EventType } from '../domain/types.ts';

/** Boolean ↔ INTEGER conversions for SQLite (which has no native BOOLEAN). */
const toInt = (b: boolean): number => (b ? 1 : 0);
const fromInt = (n: number | null | undefined): boolean => n === 1;

interface ProjectionRow {
  readonly id: string;
  readonly description: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly category_id: string | null;
  readonly date: string | null;
  readonly updated_at: number;
  readonly deleted: number;
  readonly user_id: string;
}

interface EventRow {
  readonly event_id: string;
  readonly timestamp: number;
  readonly event_type: string;
  readonly expense_id: string;
  readonly payload: string;
  readonly committed: number;
  readonly user_id: string;
}

function rowToProjection(row: ProjectionRow): ExpenseProjection {
  // Spread-conditional pattern keeps `exactOptionalPropertyTypes` happy:
  // omit optional fields entirely when the column is NULL.
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    updatedAt: row.updated_at,
    deleted: fromInt(row.deleted),
    userId: row.user_id,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.category_id !== null ? { categoryId: row.category_id } : {}),
    ...(row.date !== null ? { date: row.date } : {}),
  };
}

function rowToEvent(row: EventRow): ExpenseEvent {
  return {
    eventId: row.event_id,
    timestamp: row.timestamp,
    eventType: row.event_type as EventType,
    expenseId: row.expense_id,
    payload: row.payload,
    committed: fromInt(row.committed),
    userId: row.user_id,
  };
}

/**
 * Build a `LocalStore` bound to the given database handle. Caller is
 * responsible for calling `migrate(db)` before passing the handle in.
 */
export function createSqliteLocalStore(db: SQLiteDatabase): LocalStore {
  const transaction: TransactionRunner = async <T>(action: () => Promise<T>): Promise<T> => {
    let captured: T | undefined;
    let didCapture = false;
    await db.withTransactionAsync(async () => {
      captured = await action();
      didCapture = true;
    });
    if (!didCapture) {
      // Should be unreachable: withTransactionAsync only returns on success.
      throw new Error('SQLite transaction completed without producing a result');
    }
    return captured as T;
  };

  return {
    transaction,

    async appendEvent(event: ExpenseEvent): Promise<void> {
      await db.runAsync(
        `INSERT INTO expense_events
           (event_id, timestamp, event_type, expense_id, payload, committed, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        event.eventId,
        event.timestamp,
        event.eventType,
        event.expenseId,
        event.payload,
        toInt(event.committed),
        event.userId,
      );
    },

    async findUncommittedEvents(userId: string): Promise<ReadonlyArray<ExpenseEvent>> {
      const rows = await db.getAllAsync<EventRow>(
        `SELECT event_id, timestamp, event_type, expense_id, payload, committed, user_id
           FROM expense_events
          WHERE committed = 0 AND user_id = ?
          ORDER BY timestamp ASC`,
        userId,
      );
      return rows.map(rowToEvent);
    },

    async markEventsCommitted(eventIds: ReadonlyArray<string>): Promise<void> {
      if (eventIds.length === 0) return;
      // Bulk update in chunks to stay under SQLite's default 999 host-parameter limit.
      const CHUNK = 500;
      for (let i = 0; i < eventIds.length; i += CHUNK) {
        const chunk = eventIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE expense_events SET committed = 1 WHERE event_id IN (${placeholders})`,
          ...chunk,
        );
      }
    },

    async projectFromEvent(projection: ExpenseProjection): Promise<number> {
      // Last-write-wins UPSERT — strict `>` so equal timestamps are rejected
      // (matches the backend's `ExpenseProjectionRepository.projectFromEvent`).
      const result = await db.runAsync(
        `INSERT INTO expense_projections
           (id, description, amount, currency, category_id, date, updated_at, deleted, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           description = excluded.description,
           amount      = excluded.amount,
           currency    = excluded.currency,
           category_id = excluded.category_id,
           date        = excluded.date,
           updated_at  = excluded.updated_at,
           deleted     = excluded.deleted,
           user_id     = excluded.user_id
         WHERE excluded.updated_at > expense_projections.updated_at`,
        projection.id,
        projection.description ?? null,
        projection.amount,
        projection.currency,
        projection.categoryId ?? null,
        projection.date ?? null,
        projection.updatedAt,
        toInt(projection.deleted),
        projection.userId,
      );
      return result.changes;
    },

    async markAsDeleted(id: string, updatedAt: number): Promise<number> {
      // Strict `>` keeps the operation idempotent and prevents older
      // delete events from clobbering newer non-deleted state. Note: this
      // method does NOT resurrect — only transitions to `deleted = 1`.
      const result = await db.runAsync(
        `UPDATE expense_projections
            SET deleted = 1, updated_at = ?
          WHERE id = ? AND ? > updated_at`,
        updatedAt,
        id,
        updatedAt,
      );
      return result.changes;
    },

    async findProjectionById(
      id: string,
      userId: string,
    ): Promise<ExpenseProjection | undefined> {
      const row = await db.getFirstAsync<ProjectionRow>(
        `SELECT id, description, amount, currency, category_id, date,
                updated_at, deleted, user_id
           FROM expense_projections
          WHERE id = ? AND user_id = ?`,
        id,
        userId,
      );
      return row ? rowToProjection(row) : undefined;
    },

    async findActiveProjections(userId: string): Promise<ReadonlyArray<ExpenseProjection>> {
      const rows = await db.getAllAsync<ProjectionRow>(
        `SELECT id, description, amount, currency, category_id, date,
                updated_at, deleted, user_id
           FROM expense_projections
          WHERE user_id = ? AND deleted = 0
          ORDER BY date DESC, updated_at DESC`,
        userId,
      );
      return rows.map(rowToProjection);
    },

    async isEventProcessed(eventId: string): Promise<boolean> {
      const row = await db.getFirstAsync<{ event_id: string }>(
        `SELECT event_id FROM processed_events WHERE event_id = ?`,
        eventId,
      );
      return row !== null && row !== undefined;
    },

    async recordProcessedEvent(eventId: string): Promise<void> {
      await db.runAsync(
        `INSERT OR IGNORE INTO processed_events (event_id) VALUES (?)`,
        eventId,
      );
    },
  };
}
