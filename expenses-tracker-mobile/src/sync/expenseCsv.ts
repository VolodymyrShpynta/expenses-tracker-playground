import type { ExportExpense } from './dataExchange';

const UTF8_BOM = '\uFEFF';
const CSV_LINE_ENDING = '\r\n';
const CSV_DELIMITER = ',';
const EXPENSE_CSV_HEADER = 'date,description,amount,currency,category';
const UNSAFE_SPREADSHEET_PREFIX_PATTERN = /^[\t\r\n]|^\s*[=+\-@]/;
const CSV_QUOTING_REQUIRED_PATTERN = /[",\r\n]/;
const SPREADSHEET_TEXT_PREFIX = "'";

export function serializeExpensesCsv(expenses: ReadonlyArray<ExportExpense>): string {
  const rows = expenses.map((expense) => [
    escapeCsvCell(expense.date),
    escapeCsvCell(expense.description),
    formatCsvAmount(expense.amountMinor),
    escapeCsvCell(expense.currency),
    escapeCsvCell(expense.category),
  ].join(CSV_DELIMITER));

  const content = [EXPENSE_CSV_HEADER, ...rows].join(CSV_LINE_ENDING);
  return `${UTF8_BOM}${content}${CSV_LINE_ENDING}`;
}

function escapeCsvCell(value: string): string {
  // CSV quoting alone does not stop spreadsheets from interpreting formulas.
  const safeValue = UNSAFE_SPREADSHEET_PREFIX_PATTERN.test(value)
    ? `${SPREADSHEET_TEXT_PREFIX}${value}`
    : value;
  if (!CSV_QUOTING_REQUIRED_PATTERN.test(safeValue)) return safeValue;

  const escapedValue = safeValue.replaceAll('"', '""');
  return `"${escapedValue}"`;
}

function formatCsvAmount(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error('CSV export requires amounts to be safe integers in cents');
  }
  // Keep the cents integral instead of rounding a floating-point major-unit value.
  const absolute = Math.abs(amountMinor);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${amountMinor < 0 ? '-' : ''}${whole}.${fraction}`;
}
