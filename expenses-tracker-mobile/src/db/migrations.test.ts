import { describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrations';
import { MIGRATIONS } from './schema';
import { createTestDatabase, createTestStore } from '../test/sqliteTestStore';

const latestVersion = MIGRATIONS[MIGRATIONS.length - 1]!.version;

function schemaOf(database: SQLiteDatabase) {
  return database.getAllAsync('SELECT type, name, sql FROM sqlite_master ORDER BY name');
}

describe('migrate', () => {
  it('should bring an empty database to the latest schema version', async () => {
    // Given: an empty file database, with a connection per write transaction as on a device
    const database = createTestDatabase({ isolation: 'separate' });

    // When
    const version = await migrate(database);

    // Then: every migration applied — the same schema the test stores run on
    expect(version).toBe(latestVersion);
    expect(await database.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: latestVersion });
    expect(await schemaOf(database)).toEqual(await schemaOf(createTestStore().database));
  });

  it('should leave an up-to-date database unchanged', async () => {
    // Given
    const database = createTestDatabase();
    await migrate(database);
    const schema = await schemaOf(database);

    // When
    const version = await migrate(database);

    // Then
    expect(version).toBe(latestVersion);
    expect(await schemaOf(database)).toEqual(schema);
  });
});
