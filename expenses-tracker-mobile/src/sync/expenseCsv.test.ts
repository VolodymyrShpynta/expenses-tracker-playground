import { describe, expect, it } from 'vitest';

import { serializeExpensesCsv } from './expenseCsv';
import type { ExportExpense } from './dataExchange';

const HEADER = '\uFEFFdate,description,amount,currency,category\r\n';

function expense(overrides: Partial<ExportExpense> = {}): ExportExpense {
  return {
    date: '2026-01-15T12:00:00Z',
    description: 'Lunch',
    amountMinor: 123456,
    currency: 'ARS',
    category: 'Food',
    ...overrides,
  };
}

describe('serializeExpensesCsv', () => {
  it('exports a header with a BOM and CRLF even when there are no expenses', () => {
    // When
    const csv = serializeExpensesCsv([]);

    // Then
    expect(csv).toBe(HEADER);
  });

  it('exports original currencies and decimal amounts without conversion', () => {
    // Given
    const rows = [expense(), expense({ amountMinor: 99, currency: 'USD' })];

    // When
    const csv = serializeExpensesCsv(rows);

    // Then
    expect(csv).toBe(
      `${HEADER}2026-01-15T12:00:00Z,Lunch,1234.56,ARS,Food\r\n`
      + '2026-01-15T12:00:00Z,Lunch,0.99,USD,Food\r\n',
    );
    expect(rows[0]?.amountMinor).toBe(123456);
  });

  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [100, '1.00'],
    [-1, '-0.01'],
    [-123456, '-1234.56'],
    [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
    [Number.MIN_SAFE_INTEGER, '-90071992547409.91'],
  ])('formats %s cents exactly as %s', (amountMinor, amount) => {
    // When
    const csv = serializeExpensesCsv([expense({ amountMinor })]);

    // Then
    expect(csv).toBe(`${HEADER}2026-01-15T12:00:00Z,Lunch,${amount},ARS,Food\r\n`);
  });

  it.each([
    ['a,b', '"a,b"'],
    ['with "quote"', '"with ""quote"""'],
    ['line1\nline2', '"line1\nline2"'],
    ['line1\rline2', '"line1\rline2"'],
    ['line1\r\nline2', '"line1\r\nline2"'],
  ])('escapes the description %j', (description, escaped) => {
    // When
    const csv = serializeExpensesCsv([expense({ description })]);

    // Then
    expect(csv).toBe(`${HEADER}2026-01-15T12:00:00Z,${escaped},1234.56,ARS,Food\r\n`);
  });

  it.each([
    ['=SUM(1,2)', '"\'=SUM(1,2)"'],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@cmd', "'@cmd"],
    ['\ttext', "'\ttext"],
    ['\rtext', '"\'\rtext"'],
    ['\ntext', '"\'\ntext"'],
    ['  =1+1', "'  =1+1"],
    [' \t@cmd', "' \t@cmd"],
  ])('neutralizes spreadsheet formulas and control prefixes in %j', (description, escaped) => {
    // When
    const csv = serializeExpensesCsv([expense({ description })]);

    // Then
    expect(csv).toBe(`${HEADER}2026-01-15T12:00:00Z,${escaped},1234.56,ARS,Food\r\n`);
  });

  it('sanitizes every text column without turning negative numeric amounts into text', () => {
    // Given
    const row = expense({
      date: '=1+1',
      description: '@cmd',
      amountMinor: -123,
      currency: '+ARS',
      category: '-Food',
    });

    // When
    const csv = serializeExpensesCsv([row]);

    // Then
    expect(csv).toBe(`${HEADER}'=1+1,'@cmd,-1.23,'+ARS,'-Food\r\n`);
  });

  it('preserves accented text and escapes category names as well as descriptions', () => {
    // When
    const csv = serializeExpensesCsv([
      expense({ description: 'Caf\u00e9', category: 'Comida, "caf\u00e9"' }),
    ]);

    // Then
    expect(csv).toBe(
      `${HEADER}2026-01-15T12:00:00Z,Caf\u00e9,1234.56,ARS,"Comida, ""caf\u00e9"""\r\n`,
    );
  });

  it('preserves empty optional text cells', () => {
    // When
    const csv = serializeExpensesCsv([expense({ date: '', description: '', category: '' })]);

    // Then
    expect(csv).toBe(`${HEADER},,1234.56,ARS,\r\n`);
  });

  it.each([NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid cents %s instead of exporting a rounded or invalid number',
    (amountMinor) => {
      // When / Then
      expect(() => serializeExpensesCsv([expense({ amountMinor })]))
        .toThrow('CSV export requires amounts to be safe integers in cents');
    },
  );
});
