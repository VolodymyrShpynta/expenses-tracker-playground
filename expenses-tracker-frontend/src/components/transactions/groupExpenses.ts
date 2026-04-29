import { getLocale } from '../../i18n/locale.ts';
import type { Expense } from '../../types/expense.ts';
import type { PresetKey } from '../../utils/dateRange.ts';

/**
 * Pure helpers for grouping transactions by day/month/year. Lives
 * outside the page component so the rules are easy to test and reuse,
 * and so swapping the grouping granularity stays a one-call change.
 */

export type GroupBy = 'day' | 'month' | 'year';

/**
 * Pick a sensible group granularity from the active date-range preset:
 * a year of data is grouped by month, "all time" by year, everything
 * else by day.
 */
export function presetToGroupBy(preset: PresetKey): GroupBy {
  switch (preset) {
    case 'year': return 'month';
    case 'all': return 'year';
    default: return 'day';
  }
}

export function groupKey(date: Date, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'day': return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    case 'month': return `${date.getFullYear()}-${date.getMonth()}`;
    case 'year': return `${date.getFullYear()}`;
  }
}

export function groupLabel(date: Date, groupBy: GroupBy): string {
  const locale = getLocale();
  switch (groupBy) {
    case 'day': {
      const day = date.getDate().toString().padStart(2, '0');
      const weekday = date.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
      const month = date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();
      return `${day}  ${weekday}\n${month}`;
    }
    case 'month':
      return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();
    case 'year':
      return `${date.getFullYear()}`;
  }
}

export interface ExpenseGroup {
  key: string;
  label: string;
  date: Date;
  expenses: Expense[];
}

/**
 * Bucket `expenses` into groups keyed by `groupBy`. Input order is
 * preserved within each group, so the caller controls the sort (the
 * page sorts by date desc before calling this).
 */
export function groupExpenses(expenses: Expense[], groupBy: GroupBy): ExpenseGroup[] {
  const map = new Map<string, ExpenseGroup>();
  for (const expense of expenses) {
    const date = new Date(expense.date);
    const key = groupKey(date, groupBy);
    let group = map.get(key);
    if (!group) {
      group = { key, label: groupLabel(date, groupBy), date, expenses: [] };
      map.set(key, group);
    }
    group.expenses.push(expense);
  }
  return Array.from(map.values());
}
