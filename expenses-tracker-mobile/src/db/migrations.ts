/**
 * Migration runner — port of Flyway's "apply numbered migrations once,
 * record progress" model on top of SQLite's built-in `user_version` PRAGMA.
 *
 * Idempotent: each call applies only migrations whose version is greater
 * than the database's current `user_version`. Each migration runs inside
 * its own transaction so a crash mid-migration leaves the database at the
 * last successful version.
 *
 * Migrations are ordered, gap-free, and never edited post-release — same
 * rule as `expenses-tracker-api/src/main/resources/db/migration/`.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { MIGRATIONS } from './schema';
import { withExclusiveWriteTransaction } from './transactions';

/**
 * Apply pending migrations in order. Returns the new schema version.
 *
 * Logged at INFO level (no PII) — matches the backend's logging stance.
 */
export async function migrate(db: SQLiteDatabase): Promise<number> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = result?.user_version ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  if (pending.length === 0) return current;

  for (const migration of pending) {
    // Use the same exclusive-tx + busy_timeout helper that runtime
    // writes use, so a startup migration cannot fail with
    // `database is locked` if another connection (debugger inspector,
    // background sync from a previous launch) briefly holds the write
    // lock. Queries inside MUST go through `txn` per the Expo contract.
    await withExclusiveWriteTransaction(db, async (txn) => {
      await txn.execAsync(migration.sql);
      // PRAGMA does not accept bound parameters; safe because version is a
      // hard-coded literal from the MIGRATIONS array, not user input.
      await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  return pending[pending.length - 1]!.version;
}
