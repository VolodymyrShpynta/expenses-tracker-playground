/**
 * Field length limits for user-entered text.
 *
 * Keep these in sync with `FieldLimits.kt` on the backend (and the `VARCHAR(n)`
 * widths in the Flyway migrations). These are enforced purely in the UI for UX;
 * the backend is the source of truth for validation.
 */
export const FIELD_LIMITS = {
  EXPENSE_DESCRIPTION_MAX: 200,
  EXPENSE_CATEGORY_MAX: 50,
  CATEGORY_NAME_MAX: 50,
} as const;
