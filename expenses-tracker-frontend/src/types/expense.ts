/**
 * Expense types matching the backend DTOs.
 * Amounts are in cents (integer). Dates are ISO 8601 strings.
 */

export interface Expense {
  id: string;
  description: string;
  amount: number; // cents
  category: string;
  date: string; // ISO 8601
  updatedAt: number;
  deleted: boolean;
}

export interface CreateExpenseRequest {
  description: string;
  amount: number; // cents
  category: string;
  date: string; // ISO 8601
}

export interface UpdateExpenseRequest {
  description?: string;
  amount?: number;
  category?: string;
  date?: string;
}

export interface SyncResult {
  message: string;
}

/** Derived summary for a single category */
export interface CategorySummary {
  category: string;
  total: number; // cents
  count: number;
  percentage: number; // 0-100
}
