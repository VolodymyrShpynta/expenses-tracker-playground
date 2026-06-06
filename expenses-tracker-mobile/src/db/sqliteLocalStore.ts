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
import type { LocalStore, TransactionRunner } from '../domain/localStore';
import type {
  Category,
  CategoryEvent,
  ExpenseEvent,
  ExpenseProjection,
  EventType,
} from '../domain/types';

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
}

interface EventRow {
  readonly event_id: string;
  readonly timestamp: number;
  readonly event_type: string;
  readonly expense_id: string;
  readonly payload: string;
  readonly committed: number;
}

interface CategoryEventRow {
  readonly event_id: string;
  readonly timestamp: number;
  readonly event_type: string;
  readonly category_id: string;
  readonly payload: string;
  readonly committed: number;
}

interface CategoryRow {
  readonly id: string;
  readonly name: string | null;
  readonly template_key: string | null;
  readonly icon: string;
  readonly color: string;
  readonly sort_order: number;
  readonly updated_at: number;
  readonly deleted: number;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
    deleted: fromInt(row.deleted),
    ...(row.name !== null ? { name: row.name } : {}),
    ...(row.template_key !== null ? { templateKey: row.template_key } : {}),
  };
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
  };
}

function rowToCategoryEvent(row: CategoryEventRow): CategoryEvent {
  return {
    eventId: row.event_id,
    timestamp: row.timestamp,
    eventType: row.event_type as EventType,
    categoryId: row.category_id,
    payload: row.payload,
    committed: fromInt(row.committed),
  };
}

/**
 * Build a `LocalStore` bound to the given database handle. Caller is
 * responsible for calling `migrate(db)` before passing the handle in.
 *
 * Transactions are routed through `db.withExclusiveTransactionAsync`,
 * which opens a dedicated SQLite connection and serializes write
 * traffic at the native layer. Per the Expo contract, every query
 * issued inside the callback MUST go through the `txn` proxy — mixing
 * the outer `db` handle with an active exclusive transaction triggers
 * `database is locked`. We honour that contract by handing the action a
 * fresh `LocalStore` built on top of `txn`; callers route their nested
 * reads/writes through that `tx` argument.
 */
export function createSqliteLocalStore(db: SQLiteDatabase): LocalStore {
  const transaction: TransactionRunner = async <T>(
    action: (tx: LocalStore) => Promise<T>,
  ): Promise<T> => {
    let captured: T | undefined;
    let didCapture = false;
    await db.withExclusiveTransactionAsync(async (txn) => {
      // `txn` is a Transaction (extends SQLiteDatabase) bound to the
      // exclusive connection. Wrap it in a LocalStore so the action's
      // store calls hit the transaction connection, not the outer db.
      const txStore = buildLocalStore(txn);
      captured = await action(txStore);
      didCapture = true;
    });
    if (!didCapture) {
      // Should be unreachable: withExclusiveTransactionAsync only returns on success.
      throw new Error('SQLite transaction completed without producing a result');
    }
    return captured as T;
  };

  return buildLocalStore(db, transaction);
}

/**
 * Construct the `LocalStore` method bag bound to `handle`. `handle` is
 * either the application's `SQLiteDatabase` (outside any transaction)
 * or the `Transaction` proxy returned by `withExclusiveTransactionAsync`
 * (inside one). Both expose the same query surface.
 *
 * When called inside an exclusive transaction, `transaction` is omitted
 * by the caller and we fall back to a passthrough that simply re-invokes
 * the action with the current `tx` — honouring the (rare) nested-call
 * pattern without trying to open another BEGIN, which SQLite would
 * reject.
 */
function buildLocalStore(
  handle: SQLiteDatabase,
  transaction?: TransactionRunner,
): LocalStore {
  const store: LocalStore = {
    transaction:
      transaction
      ?? (async <T>(action: (tx: LocalStore) => Promise<T>): Promise<T> => action(store)),

    async appendEvent(event: ExpenseEvent): Promise<void> {
      await handle.runAsync(
        `INSERT INTO expense_events
           (event_id, timestamp, event_type, expense_id, payload, committed)
         VALUES (?, ?, ?, ?, ?, ?)`,
        event.eventId,
        event.timestamp,
        event.eventType,
        event.expenseId,
        event.payload,
        toInt(event.committed),
      );
    },

    async findUncommittedEvents(): Promise<ReadonlyArray<ExpenseEvent>> {
      const rows = await handle.getAllAsync<EventRow>(
        `SELECT event_id, timestamp, event_type, expense_id, payload, committed
           FROM expense_events
          WHERE committed = 0
          ORDER BY timestamp ASC`,
      );
      return rows.map(rowToEvent);
    },

    async findAllEvents(): Promise<ReadonlyArray<ExpenseEvent>> {
      const rows = await handle.getAllAsync<EventRow>(
        `SELECT event_id, timestamp, event_type, expense_id, payload, committed
           FROM expense_events
          ORDER BY timestamp ASC, event_id ASC`,
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
        await handle.runAsync(
          `UPDATE expense_events SET committed = 1 WHERE event_id IN (${placeholders})`,
          ...chunk,
        );
      }
    },

    async projectFromEvent(projection: ExpenseProjection): Promise<number> {
      // Last-write-wins UPSERT — strict `>` so equal timestamps are rejected
      // (matches the backend's `ExpenseProjectionRepository.projectFromEvent`).
      const result = await handle.runAsync(
        `INSERT INTO expense_projections
           (id, description, amount, currency, category_id, date, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           description = excluded.description,
           amount      = excluded.amount,
           currency    = excluded.currency,
           category_id = excluded.category_id,
           date        = excluded.date,
           updated_at  = excluded.updated_at,
           deleted     = excluded.deleted
         WHERE excluded.updated_at > expense_projections.updated_at`,
        projection.id,
        projection.description ?? null,
        projection.amount,
        projection.currency,
        projection.categoryId ?? null,
        projection.date ?? null,
        projection.updatedAt,
        toInt(projection.deleted),
      );
      return result.changes;
    },

    async markAsDeleted(id: string, updatedAt: number): Promise<number> {
      // Strict `>` keeps the operation idempotent and prevents older
      // delete events from clobbering newer non-deleted state. Note: this
      // method does NOT resurrect — only transitions to `deleted = 1`.
      const result = await handle.runAsync(
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
    ): Promise<ExpenseProjection | undefined> {
      const row = await handle.getFirstAsync<ProjectionRow>(
        `SELECT id, description, amount, currency, category_id, date,
                updated_at, deleted
           FROM expense_projections
          WHERE id = ?`,
        id,
      );
      return row ? rowToProjection(row) : undefined;
    },


    async projectCategoryFromEvent(category: Category): Promise<number> {
      // Last-write-wins UPSERT with strict `>` on `updated_at`. Mirrors
      // `projectFromEvent` above so cross-device sync converges to the
      // same final state regardless of arrival order.
      const result = await handle.runAsync(
        `INSERT INTO categories
           (id, name, template_key, icon, color, sort_order, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name         = excluded.name,
           template_key = excluded.template_key,
           icon         = excluded.icon,
           color        = excluded.color,
           sort_order   = excluded.sort_order,
           updated_at   = excluded.updated_at,
           deleted      = excluded.deleted
         WHERE excluded.updated_at > categories.updated_at`,
        category.id,
        category.name ?? null,
        category.templateKey ?? null,
        category.icon,
        category.color,
        category.sortOrder,
        category.updatedAt,
        toInt(category.deleted),
      );
      return result.changes;
    },

    async findCategoryById(id: string): Promise<Category | undefined> {
      const row = await handle.getFirstAsync<CategoryRow>(
        `SELECT id, name, template_key, icon, color, sort_order,
                updated_at, deleted
           FROM categories
          WHERE id = ?`,
        id,
      );
      return row ? rowToCategory(row) : undefined;
    },

    async findAllCategories(): Promise<ReadonlyArray<Category>> {
      const rows = await handle.getAllAsync<CategoryRow>(
        `SELECT id, name, template_key, icon, color, sort_order,
                updated_at, deleted
           FROM categories
          ORDER BY sort_order ASC, updated_at ASC`,
      );
      return rows.map(rowToCategory);
    },

    async softDeleteCategory(id: string, updatedAt: number): Promise<number> {
      const result = await handle.runAsync(
        `UPDATE categories
            SET deleted = 1, updated_at = ?
          WHERE id = ? AND ? > updated_at`,
        updatedAt,
        id,
        updatedAt,
      );
      return result.changes;
    },
    async findActiveProjections(): Promise<ReadonlyArray<ExpenseProjection>> {
      const rows = await handle.getAllAsync<ProjectionRow>(
        `SELECT id, description, amount, currency, category_id, date,
                updated_at, deleted
           FROM expense_projections
          WHERE deleted = 0
          ORDER BY date DESC, updated_at DESC`,
      );
      return rows.map(rowToProjection);
    },

    async findAllProjections(): Promise<ReadonlyArray<ExpenseProjection>> {
      // Includes soft-deleted rows — snapshot builder needs the full
      // state because a deleted row can still be superseded by a newer
      // non-deleted update on another device (LWW resurrection).
      const rows = await handle.getAllAsync<ProjectionRow>(
        `SELECT id, description, amount, currency, category_id, date,
                updated_at, deleted
           FROM expense_projections`,
      );
      return rows.map(rowToProjection);
    },

    async isEventProcessed(eventId: string): Promise<boolean> {
      const row = await handle.getFirstAsync<{ event_id: string }>(
        `SELECT event_id FROM processed_events WHERE event_id = ?`,
        eventId,
      );
      return row !== null && row !== undefined;
    },

    async findAllProcessedEvents(): Promise<
      ReadonlyArray<{ readonly eventId: string; readonly timestamp: number }>
    > {
      // Single full-table scan replaces N point queries when batching the
      // remote apply path. `processed_events` is two columns wide; even at
      // 100k rows this is a few MB of strings + ints — well within memory
      // budget. Returns the timestamps too because `buildSnapshot` needs
      // them for retention-window pruning of `coveredEvents`.
      const rows = await handle.getAllAsync<{ event_id: string; timestamp: number }>(
        `SELECT event_id, timestamp FROM processed_events`,
      );
      return rows.map((r) => ({ eventId: r.event_id, timestamp: r.timestamp }));
    },

    async recordProcessedEvent(eventId: string, timestamp: number): Promise<void> {
      await handle.runAsync(
        `INSERT OR IGNORE INTO processed_events (event_id, timestamp) VALUES (?, ?)`,
        eventId,
        timestamp,
      );
    },

    async appendCategoryEvent(event: CategoryEvent): Promise<void> {
      await handle.runAsync(
        `INSERT INTO category_events
           (event_id, timestamp, event_type, category_id, payload, committed)
         VALUES (?, ?, ?, ?, ?, ?)`,
        event.eventId,
        event.timestamp,
        event.eventType,
        event.categoryId,
        event.payload,
        toInt(event.committed),
      );
    },

    async findUncommittedCategoryEvents(): Promise<ReadonlyArray<CategoryEvent>> {
      const rows = await handle.getAllAsync<CategoryEventRow>(
        `SELECT event_id, timestamp, event_type, category_id, payload, committed
           FROM category_events
          WHERE committed = 0
          ORDER BY timestamp ASC`,
      );
      return rows.map(rowToCategoryEvent);
    },

    async findAllCategoryEvents(): Promise<ReadonlyArray<CategoryEvent>> {
      const rows = await handle.getAllAsync<CategoryEventRow>(
        `SELECT event_id, timestamp, event_type, category_id, payload, committed
           FROM category_events
          ORDER BY timestamp ASC, event_id ASC`,
      );
      return rows.map(rowToCategoryEvent);
    },

    async markCategoryEventsCommitted(eventIds: ReadonlyArray<string>): Promise<void> {
      if (eventIds.length === 0) return;
      // Same chunked bulk-update as `markEventsCommitted` — stays under
      // SQLite's default 999 host-parameter limit.
      const CHUNK = 500;
      for (let i = 0; i < eventIds.length; i += CHUNK) {
        const chunk = eventIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        await handle.runAsync(
          `UPDATE category_events SET committed = 1 WHERE event_id IN (${placeholders})`,
          ...chunk,
        );
      }
    },
  };
  return store;
}
