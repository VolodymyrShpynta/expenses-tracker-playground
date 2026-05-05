/**
 * Group expenses by day/month/year for the Transactions list. Mobile
 * port of `expenses-tracker-frontend/src/components/transactions/groupExpenses.ts`
 * with locale passed in (no `getLocale()` global on mobile).
 */
import type { ExpenseProjection } from '../domain/types';
import type { GroupBy } from '../utils/dateRange';

export function groupKey(date: Date, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'day': return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    case 'month': return `${date.getFullYear()}-${date.getMonth()}`;
    case 'year': return `${date.getFullYear()}`;
  }
}

export function groupLabel(date: Date, groupBy: GroupBy, locale: string): string {
  switch (groupBy) {
    case 'day': {
      const day = date.getDate().toString().padStart(2, '0');
      const weekday = date.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
      const month = date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();
      return `${day}  ${weekday}  ${month}`;
    }
    case 'month':
      return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();
    case 'year':
      return `${date.getFullYear()}`;
  }
}

export interface ExpenseGroup {
  readonly key: string;
  readonly label: string;
  readonly date: Date;
  readonly total: number;
  readonly expenses: ReadonlyArray<ExpenseProjection>;
}

/**
 * Bucket a (caller-sorted) list of expenses into groups. Input order is
 * preserved within each bucket so the page can sort by date desc once.
 */
export function groupExpenses(
  expenses: ReadonlyArray<ExpenseProjection>,
  groupBy: GroupBy,
  locale: string,
): ExpenseGroup[] {
  const map = new Map<string, { date: Date; expenses: ExpenseProjection[]; total: number }>();
  for (const expense of expenses) {
    if (!expense.date) continue;
    const date = new Date(expense.date);
    const key = groupKey(date, groupBy);
    let group = map.get(key);
    if (!group) {
      group = { date, expenses: [], total: 0 };
      map.set(key, group);
    }
    group.expenses.push(expense);
    group.total += expense.amount;
  }
  return Array.from(map.entries()).map(([key, g]) => ({
    key,
    label: groupLabel(g.date, groupBy, locale),
    date: g.date,
    total: g.total,
    expenses: g.expenses,
  }));
}
