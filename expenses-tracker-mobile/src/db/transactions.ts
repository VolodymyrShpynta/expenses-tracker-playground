/**
 * Shared helper for opening exclusive write transactions against the
 * local SQLite database.
 *
 * Expo opens a dedicated connection for each exclusive transaction,
 * but SQLite still allows only one writer per database file. Queue
 * writers across stores and handles before opening their connections
 * so they do not contend inside SQLite while awaiting JS callbacks.
 *
 * The per-connection busy timeout remains a fallback for writers
 * outside this JS runtime. Expo uses BEGIN DEFERRED, so the PRAGMA
 * takes effect before the callback's first write acquires the lock.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

const WRITE_BUSY_TIMEOUT_MS = 30_000;
const pendingWrites = new Map<string, Promise<void>>();

/**
 * Run `task` inside an exclusive write transaction on `db`. The queue
 * is held until native commit or rollback completes, not just until
 * the callback returns.
 *
 * `task` receives the transaction-bound database handle (typed as
 * `SQLiteDatabase` because the private `Transaction` subclass is not
 * exported by `expo-sqlite`). All queries inside MUST go through that
 * handle, never the outer `db` — see `withExclusiveTransactionAsync`'s
 * contract.
 */
export async function withExclusiveWriteTransaction(
  db: SQLiteDatabase,
  task: (txn: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  const previous = pendingWrites.get(db.databasePath) ?? Promise.resolve();
  const current = previous.then(() => db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`PRAGMA busy_timeout = ${WRITE_BUSY_TIMEOUT_MS}`);
    await task(txn);
  }));
  const settled = current.catch(() => undefined);
  pendingWrites.set(db.databasePath, settled);

  try {
    await current;
  } finally {
    if (pendingWrites.get(db.databasePath) === settled) {
      pendingWrites.delete(db.databasePath);
    }
  }
}
