/**
 * Shared helper for opening exclusive write transactions against the
 * local SQLite database.
 *
 * Why this exists
 * ---------------
 * `db.withExclusiveTransactionAsync` opens a dedicated connection for
 * each call (see `Transaction.createAsync` in `expo-sqlite`). In WAL
 * mode the write lock can be held by exactly one connection at a time;
 * with the SQLite default `busy_timeout = 0`, a second concurrent
 * writer (e.g. `createExpense` racing `useExchangeRatesSync.upsertRates`)
 * aborts immediately with `database is locked` instead of waiting for
 * the first commit. The two writers don't share a connection so a JS
 * mutex on a single store would not help.
 *
 * The fix is to set `busy_timeout` on every exclusive-tx connection.
 * `BEGIN` issued by `withExclusiveTransactionAsync` is `BEGIN DEFERRED`,
 * so the write lock is not acquired until the first INSERT/UPDATE in
 * the callback — by the time we run our PRAGMA the lock is still free,
 * and the subsequent statements respect the timeout.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Upper bound on how long a writer will wait for the lock before
 * surfacing `database is locked`. Real writes finish in a few ms; the
 * generous 30 s ceiling makes the failure mode effectively impossible
 * in practice while still being well below any UI timeout the user
 * might perceive (the app would already be showing a spinner long
 * before this fires).
 */
const WRITE_BUSY_TIMEOUT_MS = 30_000;

/**
 * Run `task` inside an exclusive write transaction on `db`, with the
 * dedicated connection's busy timeout set so concurrent writers wait
 * instead of failing fast.
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
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`PRAGMA busy_timeout = ${WRITE_BUSY_TIMEOUT_MS}`);
    await task(txn);
  });
}
