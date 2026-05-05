import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/locale', () => ({
  // Lock locale so toLocaleString output is deterministic across CI/dev machines.
  getLocale: () => 'en-US',
}));

const {
  formatAmount,
  formatAmountWithCurrency,
  formatAmountCompact,
  formatAmountCompactWithCurrency,
} = await import('./format');

describe('formatAmount', () => {
  it('renders cents with two decimals and grouping separators', () => {
    expect(formatAmount(501276)).toBe('5,012.76');
  });

  it('handles zero', () => {
    expect(formatAmount(0)).toBe('0.00');
  });

  it('handles negative amounts', () => {
    expect(formatAmount(-1250)).toBe('-12.50');
  });

  it('rounds to two decimals', () => {
    expect(formatAmount(1)).toBe('0.01');
  });
});

describe('formatAmountWithCurrency', () => {
  it('prefixes the currency code', () => {
    expect(formatAmountWithCurrency(501276, 'CZK')).toBe('CZK 5,012.76');
  });
});

describe('formatAmountCompact', () => {
  it('rounds to whole units and drops decimals', () => {
    expect(formatAmountCompact(501276)).toBe('5,013');
    expect(formatAmountCompact(1249)).toBe('12');
    expect(formatAmountCompact(1250)).toBe('13');
  });
});

describe('formatAmountCompactWithCurrency', () => {
  it('prefixes the currency code', () => {
    expect(formatAmountCompactWithCurrency(501276, 'USD')).toBe('USD 5,013');
  });
});
