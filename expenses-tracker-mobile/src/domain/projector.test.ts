/**
 * Projector correctness tests. 1:1 coverage of the scenarios in
 * `expenses-tracker-api/src/test/.../ExpenseProjectionRepositoryTest.kt`.
 *
 * Given/When/Then with backtick descriptive names is the project
 * convention from `.github/instructions/test-conventions.instructions.md`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { projectPayload, softDelete } from './projector';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { TEST_USER_ID, makePayload } from '../test/fixtures';

describe('projector — last-write-wins', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    // Wipe in dependency order, mirroring the SQLite test cleanup convention.
    store = new InMemoryLocalStore();
    store.reset();
  });

  it('should insert new expense when not exists', async () => {
    // Given: An empty store
    const id = 'exp-1';

    // When: Projecting a new payload
    const rows = await projectPayload(store, makePayload({ id, updatedAt: 1000 }));

    // Then: Row is inserted
    expect(rows).toBe(1);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.description).toBe('Coffee');
    expect(stored?.amount).toBe(350);
    expect(stored?.deleted).toBe(false);
  });

  it('should update existing expense with newer timestamp', async () => {
    // Given: An existing projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000, description: 'Old' }));

    // When: Re-projecting with newer timestamp t=2000
    const rows = await projectPayload(
      store,
      makePayload({ id, updatedAt: 2000, description: 'New', amount: 999 }),
    );

    // Then: Update applied
    expect(rows).toBe(1);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.description).toBe('New');
    expect(stored?.amount).toBe(999);
    expect(stored?.updatedAt).toBe(2000);
  });

  it('should NOT update existing expense with older timestamp (last-write-wins)', async () => {
    // Given: An existing projection at t=2000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 2000, description: 'Newer' }));

    // When: Re-projecting with older timestamp t=1000
    const rows = await projectPayload(
      store,
      makePayload({ id, updatedAt: 1000, description: 'Older' }),
    );

    // Then: Update is rejected
    expect(rows).toBe(0);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.description).toBe('Newer');
    expect(stored?.updatedAt).toBe(2000);
  });

  it('should NOT update when timestamps are equal (strict greater-than rule)', async () => {
    // Given: An existing projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000, description: 'First' }));

    // When: Upserting with the same timestamp (concurrent device write)
    const rows = await projectPayload(
      store,
      makePayload({ id, updatedAt: 1000, description: 'Second' }),
    );

    // Then: Original is kept (matches backend SQL `WHERE EXCLUDED.updated_at > …`)
    expect(rows).toBe(0);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.description).toBe('First');
  });

  it('should be idempotent — same operation twice has no effect', async () => {
    // Given: A projection at t=1000
    const id = 'exp-1';
    const payload = makePayload({ id, updatedAt: 1000, amount: 500 });
    await projectPayload(store, payload);

    // When: Re-applying the exact same payload
    const rows = await projectPayload(store, payload);

    // Then: No-op (equal timestamp rejected by the strict-> rule)
    expect(rows).toBe(0);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.amount).toBe(500);
  });

  it('should accept multiple updates with increasing timestamps', async () => {
    // Given/When: Successive updates at t=1000, 2000, 3000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000, amount: 100 }));
    await projectPayload(store, makePayload({ id, updatedAt: 2000, amount: 200 }));
    await projectPayload(store, makePayload({ id, updatedAt: 3000, amount: 300 }));

    // Then: Latest timestamp wins
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.amount).toBe(300);
    expect(stored?.updatedAt).toBe(3000);
  });

  it('should resolve out-of-order operations to the newest write', async () => {
    // Given/When: An older write arrives after a newer one
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 3000, amount: 300 }));
    await projectPayload(store, makePayload({ id, updatedAt: 1000, amount: 100 }));
    await projectPayload(store, makePayload({ id, updatedAt: 2000, amount: 200 }));

    // Then: t=3000 row remains, all older writes were rejected
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.amount).toBe(300);
    expect(stored?.updatedAt).toBe(3000);
  });

  it('should override older non-deleted expense with deleted=true at newer timestamp', async () => {
    // Given: A live projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000, deleted: false }));

    // When: A delete event arrives at t=2000
    const rows = await projectPayload(
      store,
      makePayload({ id, updatedAt: 2000, deleted: true }),
    );

    // Then: Soft-deleted
    expect(rows).toBe(1);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.deleted).toBe(true);
  });

  it('should NOT override existing expense with deleted=true at older timestamp', async () => {
    // Given: A newer non-deleted projection at t=2000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 2000, deleted: false }));

    // When: An older delete arrives at t=1000
    const rows = await projectPayload(
      store,
      makePayload({ id, updatedAt: 1000, deleted: true }),
    );

    // Then: Rejected — the row remains alive
    expect(rows).toBe(0);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.deleted).toBe(false);
  });

  it('should NOT resurrect a deleted expense with an older non-deleted update', async () => {
    // Given: A deleted projection at t=2000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 2000, deleted: true }));

    // When: An older non-deleted update arrives at t=1000
    const rows = await projectPayload(
      store,
      makePayload({ id, updatedAt: 1000, deleted: false, description: 'Stale' }),
    );

    // Then: Rejected — the row stays deleted
    expect(rows).toBe(0);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.deleted).toBe(true);
  });

  it('should resurrect a deleted expense with a newer non-deleted update', async () => {
    // Given: A deleted projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000, deleted: true }));

    // When: A newer non-deleted update arrives at t=2000
    const rows = await projectPayload(
      store,
      makePayload({ id, updatedAt: 2000, deleted: false, description: 'Resurrected' }),
    );

    // Then: Row is alive again
    expect(rows).toBe(1);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.deleted).toBe(false);
    expect(stored?.description).toBe('Resurrected');
  });

  it('should converge concurrent updates from multiple devices to the latest timestamp', async () => {
    // Given: An initial projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000 }));

    // When: Two devices write concurrently with different timestamps
    await projectPayload(store, makePayload({ id, updatedAt: 2500, description: 'Device A' }));
    await projectPayload(store, makePayload({ id, updatedAt: 2400, description: 'Device B' }));

    // Then: The newer wall-clock wins regardless of arrival order
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.description).toBe('Device A');
    expect(stored?.updatedAt).toBe(2500);
  });

  it('should preserve all expense fields through projection', async () => {
    // Given: A payload with every field populated
    const id = 'exp-1';
    const payload = makePayload({
      id,
      updatedAt: 1234567890,
      description: 'Annual subscription',
      amount: 9999,
      currency: 'EUR',
      categoryId: 'cat-bills',
      date: '2026-03-15T12:00:00Z',
      deleted: false,
    });

    // When: Projecting
    await projectPayload(store, payload);

    // Then: All fields round-trip
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored).toEqual({
      id,
      description: 'Annual subscription',
      amount: 9999,
      currency: 'EUR',
      categoryId: 'cat-bills',
      date: '2026-03-15T12:00:00Z',
      updatedAt: 1234567890,
      deleted: false,
      userId: TEST_USER_ID,
    });
  });
});

describe('projector — softDelete (mark-as-deleted helper)', () => {
  let store: InMemoryLocalStore;

  beforeEach(() => {
    store = new InMemoryLocalStore();
  });

  it('should mark an active expense as deleted', async () => {
    // Given: A live projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000 }));

    // When: softDelete with newer timestamp
    const rows = await softDelete(store, id, 2000);

    // Then: Marked deleted
    expect(rows).toBe(1);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.deleted).toBe(true);
    expect(stored?.updatedAt).toBe(2000);
  });

  it('should NOT mark deleted with older timestamp', async () => {
    // Given: A live projection at t=2000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 2000 }));

    // When: softDelete with older timestamp
    const rows = await softDelete(store, id, 1000);

    // Then: Rejected
    expect(rows).toBe(0);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.deleted).toBe(false);
  });

  it('should NOT mark deleted when timestamps are equal', async () => {
    // Given: A live projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000 }));

    // When: softDelete with equal timestamp
    const rows = await softDelete(store, id, 1000);

    // Then: Rejected (strict-> rule)
    expect(rows).toBe(0);
  });

  it('should be idempotent', async () => {
    // Given: A deleted projection at t=2000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 1000 }));
    await softDelete(store, id, 2000);

    // When: softDelete with same timestamp again
    const rows = await softDelete(store, id, 2000);

    // Then: No-op
    expect(rows).toBe(0);
  });

  it('should be a no-op on a non-existent expense', async () => {
    // Given: An empty store
    // When: softDelete an unknown id
    const rows = await softDelete(store, 'unknown', 1000);

    // Then: No rows affected
    expect(rows).toBe(0);
  });

  it('should bump updatedAt on already-deleted expense with newer timestamp', async () => {
    // Given: An already-deleted projection at t=1000
    const id = 'exp-1';
    await projectPayload(store, makePayload({ id, updatedAt: 500 }));
    await softDelete(store, id, 1000);

    // When: A second delete event arrives at t=2000
    const rows = await softDelete(store, id, 2000);

    // Then: updatedAt is bumped (the row stays deleted, but the timestamp
    // moves forward — this matters for the resurrection rule).
    expect(rows).toBe(1);
    const stored = await store.findProjectionById(id, TEST_USER_ID);
    expect(stored?.deleted).toBe(true);
    expect(stored?.updatedAt).toBe(2000);
  });
});
