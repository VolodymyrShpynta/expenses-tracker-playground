/**
 * Real-SQLite `LocalStore` for Vitest: the production store
 * (`createSqliteLocalStore`) and schema, run on Node's built-in
 * `node:sqlite` (Node >= 22.13).
 *
 * Only `expo-sqlite` itself is replaced, by a thin adapter exposing the
 * few `SQLiteDatabase` methods the store and migrations call. The SQL, the
 * strict-`>` last-write-wins rules, the unique indexes and transaction
 * rollback under test are therefore the ones the app runs. Not covered:
 * the Expo native bridge and the SQLite build bundled in the app.
 *
 * Two isolation modes:
 *   - `shared` (default): one in-memory database and connection. Fastest;
 *     a transaction runs on the same connection as the reads around it.
 *   - `separate`: a temp-file database in WAL mode with a dedicated
 *     connection per write transaction, as `withExclusiveTransactionAsync`
 *     does on a device. Reads outside a transaction see only committed
 *     data. Use it for tests about writers queueing behind each other.
 *
 * `src/test/setup.ts` closes every store and deletes its files after each
 * test.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS } from '../db/schema';
import {
  createSqliteLocalStore,
  rowToCategory,
  rowToCategoryEvent,
  rowToEvent,
  rowToProjection,
} from '../db/sqliteLocalStore';
import type { LocalStore } from '../domain/localStore';
import type { Category, CategoryEvent, ExpenseEvent, ExpenseProjection } from '../domain/types';

export type TestStoreIsolation = 'shared' | 'separate';

export interface TestStoreOptions {
  readonly isolation?: TestStoreIsolation;
}

export interface TestLocalStore extends LocalStore {
  /** The adapter the production store runs on — for schema / migration tests. */
  readonly database: SQLiteDatabase;
  /** Every row of a table in insertion order, read synchronously. */
  allEvents(): ReadonlyArray<ExpenseEvent>;
  allCategoryEvents(): ReadonlyArray<CategoryEvent>;
  allProjections(): ReadonlyArray<ExpenseProjection>;
  allCategories(): ReadonlyArray<Category>;
}

const openConnections = new Set<DatabaseSync>();
const tempDirs = new Set<string>();
let memoryDatabaseCount = 0;

/** Close every test store's connections and delete their files. */
export function closeTestStores(): void {
  for (const connection of openConnections) connection.close();
  openConnections.clear();
  // Windows refuses to delete a database file that is still open, which
  // is why every connection is closed first.
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
}

/**
 * Create a migrated, empty store. Migrations run synchronously from the
 * production `MIGRATIONS` SQL so stores can be built in plain functions;
 * `src/db/migrations.test.ts` checks the async `migrate()` produces the
 * same schema.
 */
export function createTestStore(options: TestStoreOptions = {}): TestLocalStore {
  const isolation = options.isolation ?? 'shared';
  const { connection, database } = open(isolation);
  for (const migration of MIGRATIONS) {
    connection.exec(migration.sql);
    connection.exec(`PRAGMA user_version = ${migration.version}`);
  }

  const store = createSqliteLocalStore(database);
  const testStore: TestLocalStore = {
    ...store,
    database,
    transaction: (action) => store.transaction((tx) =>
      action(isolation === 'shared' ? withOverrides(tx, testStore, store) : tx),
    ),
    allEvents: () => dump(connection, 'expense_events', rowToEvent),
    allCategoryEvents: () => dump(connection, 'category_events', rowToCategoryEvent),
    allProjections: () => dump(connection, 'expense_projections', rowToProjection),
    allCategories: () => dump(connection, 'categories', rowToCategory),
  };
  return testStore;
}

/** An empty, unmigrated database — for running the production `migrate()`. */
export function createTestDatabase(options: TestStoreOptions = {}): SQLiteDatabase {
  return open(options.isolation ?? 'shared').database;
}

function open(isolation: TestStoreIsolation): {
  readonly connection: DatabaseSync;
  readonly database: SQLiteDatabase;
} {
  const path = isolation === 'separate'
    ? newDatabaseFile()
    : `:memory:#${++memoryDatabaseCount}`;
  const connection = connect(isolation === 'separate' ? path : ':memory:');
  if (isolation === 'separate') connection.exec('PRAGMA journal_mode = WAL');
  return { connection, database: adapt(connection, path, isolation) };
}

function newDatabaseFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'expenses-test-'));
  tempDirs.add(dir);
  return join(dir, 'expenses.db');
}

function connect(path: string): DatabaseSync {
  const connection = new DatabaseSync(path);
  // Durability only — skipping fsync keeps file-backed tests fast and does
  // not change what any query returns.
  connection.exec('PRAGMA synchronous = OFF');
  openConnections.add(connection);
  return connection;
}

function disconnect(connection: DatabaseSync): void {
  connection.close();
  openConnections.delete(connection);
}

/**
 * Production sets a 30 s `busy_timeout` on each write transaction.
 * node:sqlite waits for a lock synchronously, blocking the event loop the
 * lock holder needs in order to finish, so a test that writes outside the
 * write queue would hang for the whole timeout. Fail fast instead.
 */
function failFastOnLocks(sql: string): string {
  return sql.replace(/PRAGMA busy_timeout\s*=\s*\d+/gi, 'PRAGMA busy_timeout = 0');
}

function adapt(
  connection: DatabaseSync,
  path: string,
  isolation: TestStoreIsolation,
): SQLiteDatabase {
  const database = {
    databasePath: path,
    async execAsync(sql: string): Promise<void> {
      connection.exec(failFastOnLocks(sql));
    },
    async runAsync(sql: string, ...params: SQLInputValue[]) {
      const result = connection.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync(sql: string, ...params: SQLInputValue[]) {
      return connection.prepare(sql).all(...params);
    },
    async getFirstAsync(sql: string, ...params: SQLInputValue[]) {
      return connection.prepare(sql).get(...params) ?? null;
    },
    // Mirrors expo-sqlite 55's `withExclusiveTransactionAsync`: a new
    // connection, plain `BEGIN`, then `COMMIT` or `ROLLBACK`, then close.
    async withExclusiveTransactionAsync(
      task: (txn: SQLiteDatabase) => Promise<void>,
    ): Promise<void> {
      const dedicated = isolation === 'separate';
      const txConnection = dedicated ? connect(path) : connection;
      try {
        txConnection.exec('BEGIN');
        await task(dedicated ? adapt(txConnection, path, isolation) : (database as unknown as SQLiteDatabase));
        txConnection.exec('COMMIT');
      } catch (error) {
        rollback(txConnection);
        throw error;
      } finally {
        if (dedicated) disconnect(txConnection);
      }
    },
  };
  return database as unknown as SQLiteDatabase;
}

function rollback(connection: DatabaseSync): void {
  try {
    connection.exec('ROLLBACK');
  } catch {
    // SQLite already rolled back (or BEGIN never ran); the original error
    // is the one worth reporting.
  }
}

/**
 * In `shared` mode a method replaced on the test store (`vi.spyOn`, or
 * plain assignment) is also used by the transaction-bound store, so a test
 * can inject a failure into the write path. Both stores use the one
 * connection, so the replacement's call back to the original still runs
 * inside the open transaction.
 */
function withOverrides(tx: LocalStore, testStore: TestLocalStore, originals: LocalStore): LocalStore {
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property !== 'transaction' && property in originals) {
        const current: unknown = Reflect.get(testStore, property);
        if (current !== Reflect.get(originals, property)) return current;
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

function dump<Row, T>(connection: DatabaseSync, table: string, map: (row: Row) => T): ReadonlyArray<T> {
  const rows = connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  return (rows as unknown as Row[]).map(map);
}
