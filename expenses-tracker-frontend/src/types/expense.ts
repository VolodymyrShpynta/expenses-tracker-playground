/**
 * Expense types matching the backend DTOs.
 * Amounts are in cents (integer). Dates are ISO 8601 strings.
 */

export interface Expense {
  id: string;
  description: string;
  amount: number; // cents (in the currency the user entered)
  currency: string; // ISO 4217 currency code
  categoryId: string; // UUID reference to a Category
  date: string; // ISO 8601
  updatedAt: number;
  deleted: boolean;
}

export interface CreateExpenseRequest {
  description: string;
  amount: number; // cents
  currency: string; // ISO 4217 currency code
  categoryId: string;
  date: string; // ISO 8601
}

export interface UpdateExpenseRequest {
  description?: string;
  amount?: number;
  currency?: string;
  categoryId?: string;
  date?: string;
}

/**
 * Per-category aggregate derived from a list of expenses.
 * Display fields (name, color, icon) are resolved at render time via
 * `useCategoryLookup`, so renaming/recoloring a category propagates without
 * touching this shape.
 */
export interface CategorySummary {
  categoryId: string;
  total: number; // cents
  count: number;
  percentage: number; // 0-100
}
