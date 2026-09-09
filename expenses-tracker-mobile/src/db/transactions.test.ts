import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it, vi } from 'vitest';

import { withExclusiveWriteTransaction } from './transactions';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function createDatabase(databasePath = 'expenses.db') {
  const execAsync = vi.fn(async () => {});
  const transaction = { execAsync } as unknown as SQLiteDatabase;
  const withExclusiveTransactionAsync = vi.fn(async (task: (txn: SQLiteDatabase) => Promise<void>) => {
    await task(transaction);
  });
  const db = { databasePath, withExclusiveTransactionAsync } as unknown as SQLiteDatabase;
  return { db, transaction, execAsync, withExclusiveTransactionAsync };
}

describe('withExclusiveWriteTransaction', () => {
  it.each(['task', 'commit'] as const)(
    'should queue writers to the same database while the previous %s is pending',
    async (phase) => {
      // Given
      const first = createDatabase();
      const second = createDatabase();
      const entered = deferred();
      const release = deferred();
      if (phase === 'commit') {
        first.withExclusiveTransactionAsync.mockImplementationOnce(async (task) => {
          await task(first.transaction);
          entered.resolve();
          await release.promise;
        });
      }
      const firstWrite = withExclusiveWriteTransaction(first.db, async () => {
        if (phase === 'task') {
          entered.resolve();
          await release.promise;
        }
      });
      await entered.promise;

      // When
      const secondTask = vi.fn(async () => {});
      const secondWrite = withExclusiveWriteTransaction(second.db, secondTask);
      await Promise.resolve();

      // Then
      try {
        expect(second.withExclusiveTransactionAsync).not.toHaveBeenCalled();
        expect(secondTask).not.toHaveBeenCalled();
      } finally {
        release.resolve();
        await Promise.all([firstWrite, secondWrite]);
      }
      expect(secondTask).toHaveBeenCalledExactlyOnceWith(second.transaction);
    },
  );

  it('should run an expense save before a subsequently queued sync batch', async () => {
    // Given
    const { db } = createDatabase();
    const entered = deferred();
    const release = deferred();
    const order: string[] = [];
    const activeWrite = withExclusiveWriteTransaction(db, async () => {
      order.push('active-sync-batch');
      entered.resolve();
      await release.promise;
    });
    await entered.promise;

    // When
    const queuedWrites = ['expense-save', 'next-sync-batch'].map((label) =>
      withExclusiveWriteTransaction(db, async () => { order.push(label); }),
    );
    release.resolve();
    await Promise.all([activeWrite, ...queuedWrites]);

    // Then
    expect(order).toEqual(['active-sync-batch', 'expense-save', 'next-sync-batch']);
  });

  it.each(['begin', 'setup', 'task', 'commit'] as const)(
    'should propagate a %s failure without blocking queued or subsequent writes',
    async (phase) => {
      // Given
      const first = createDatabase();
      const second = createDatabase();
      const failure = new Error(`${phase} failed`);
      if (phase === 'begin') first.withExclusiveTransactionAsync.mockRejectedValueOnce(failure);
      if (phase === 'setup') first.execAsync.mockRejectedValueOnce(failure);
      if (phase === 'commit') {
        first.withExclusiveTransactionAsync.mockImplementationOnce(async (task) => {
          await task(first.transaction);
          throw failure;
        });
      }
      const failedTask = vi.fn(async () => {
        if (phase === 'task') throw failure;
      });
      const nextTask = vi.fn(async () => {});

      // When
      const failedWrite = withExclusiveWriteTransaction(first.db, failedTask);
      const rejection = expect(failedWrite).rejects.toBe(failure);
      const queuedWrite = withExclusiveWriteTransaction(second.db, nextTask);
      await Promise.all([rejection, queuedWrite]);
      await withExclusiveWriteTransaction(first.db, nextTask);

      // Then
      expect(second.withExclusiveTransactionAsync).toHaveBeenCalledOnce();
      expect(first.withExclusiveTransactionAsync).toHaveBeenCalledTimes(2);
      expect(nextTask).toHaveBeenCalledTimes(2);
      expect(failedTask).toHaveBeenCalledTimes(phase === 'begin' || phase === 'setup' ? 0 : 1);
    },
  );

  it('should not block a writer to a different database file', async () => {
    // Given
    const first = createDatabase('first.db');
    const second = createDatabase('second.db');
    const entered = deferred();
    const release = deferred();
    const firstWrite = withExclusiveWriteTransaction(first.db, async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;

    // When
    const secondWrite = withExclusiveWriteTransaction(second.db, async () => {});
    await Promise.resolve();

    // Then
    try {
      expect(second.withExclusiveTransactionAsync).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      await Promise.all([firstWrite, secondWrite]);
    }
  });

  it('should configure the transaction handle before running the write callback', async () => {
    // Given
    const { db, transaction, execAsync } = createDatabase();

    // When
    await withExclusiveWriteTransaction(db, async (txn) => {
      // Then
      expect(txn).toBe(transaction);
      expect(execAsync).toHaveBeenCalledExactlyOnceWith('PRAGMA busy_timeout = 30000');
    });
  });
});