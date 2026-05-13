/**
 * Mapping tests — `payloadToProjection` and `eventEntryToProjection`.
 */
import { describe, expect, it } from 'vitest';
import { eventEntryToProjection, payloadToProjection } from './mapping';

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
    };

    // When: Converted
    const projection = payloadToProjection(payload);

    // Then: All fields are preserved
    expect(projection).toEqual(payload);
  });

  it('should default amount to 0 and currency to USD when missing', () => {
    // Given: A partial payload
    const payload = { id: 'exp-1', updatedAt: 1000 };

    // When: Converted
    const projection = payloadToProjection(payload);

    // Then: Defaults applied (mirrors backend ExpenseMapper)
    expect(projection.amount).toBe(0);
    expect(projection.currency).toBe('USD');
    expect(projection.deleted).toBe(false);
  });
});

describe('eventEntryToProjection', () => {
  it('should convert an event entry to a projection via its payload', () => {
    // Given: An event entry
    const entry = {
      eventId: 'evt-1',
      timestamp: 1000,
      eventType: 'CREATED' as const,
      expenseId: 'exp-1',
      payload: { id: 'exp-1', updatedAt: 1000, amount: 500 },
    };

    // When: Converted
    const projection = eventEntryToProjection(entry);

    // Then: Payload shape is preserved with defaults filled in
    expect(projection.id).toBe('exp-1');
    expect(projection.amount).toBe(500);
    expect(projection.currency).toBe('USD');
    expect(projection.deleted).toBe(false);
  });
});
