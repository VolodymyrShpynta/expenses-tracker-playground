/**
 * Mapping tests — `payloadToProjection` and `eventEntryToProjection`.
 */
import { describe, expect, it } from 'vitest';
import { eventEntryToProjection, payloadToProjection } from './mapping.ts';
import { TEST_USER_ID } from '../test/fixtures.ts';

describe('payloadToProjection', () => {
  it('should convert a fully-populated payload to a projection', () => {
    // Given: A payload with every field
    const payload = {
      id: 'exp-1',
      description: 'Coffee',
      amount: 350,
      currency: 'USD',
      categoryId: 'cat-1',
      date: '2026-01-01T08:00:00Z',
      updatedAt: 1000,
      deleted: false,
      userId: TEST_USER_ID,
    };

    // When: Converted
    const projection = payloadToProjection(payload);

    // Then: All fields are preserved
    expect(projection).toEqual(payload);
  });

  it('should default amount to 0 and currency to USD when missing', () => {
    // Given: A partial payload
    const payload = { id: 'exp-1', updatedAt: 1000, userId: TEST_USER_ID };

    // When: Converted
    const projection = payloadToProjection(payload);

    // Then: Defaults applied (mirrors backend ExpenseMapper)
    expect(projection.amount).toBe(0);
    expect(projection.currency).toBe('USD');
    expect(projection.deleted).toBe(false);
  });

  it('should throw when userId is missing', () => {
    // Given: A payload without a userId
    const payload = { id: 'exp-1', updatedAt: 1000 };

    // Then: Conversion throws
    expect(() => payloadToProjection(payload)).toThrow(/userId is required/);
  });
});

describe('eventEntryToProjection', () => {
  it('should fall back to event-level userId when payload has none', () => {
    // Given: An event entry whose payload omits userId
    const entry = {
      eventId: 'evt-1',
      timestamp: 1000,
      eventType: 'CREATED' as const,
      expenseId: 'exp-1',
      payload: { id: 'exp-1', updatedAt: 1000, amount: 500 },
      userId: TEST_USER_ID,
    };

    // When: Converted
    const projection = eventEntryToProjection(entry);

    // Then: Event-level userId is used
    expect(projection.userId).toBe(TEST_USER_ID);
  });

  it('should keep payload userId when both are present', () => {
    // Given: An event entry whose payload has its own userId
    const entry = {
      eventId: 'evt-1',
      timestamp: 1000,
      eventType: 'UPDATED' as const,
      expenseId: 'exp-1',
      payload: { id: 'exp-1', updatedAt: 1000, userId: 'payload-user' },
      userId: 'event-user',
    };

    // When: Converted
    const projection = eventEntryToProjection(entry);

    // Then: Payload userId wins (matches backend behaviour)
    expect(projection.userId).toBe('payload-user');
  });
});
