/**
 * Category types matching the backend DTOs.
 */

export interface Category {
  id: string;
  /**
   * User-supplied name override. `null` for pristine templated rows —
   * the frontend resolves the displayed label via
   * `categoryTemplates.<templateKey>` in that case.
   */
  name: string | null;
  icon: string; // icon key mapped to MUI icon component on frontend
  color: string; // hex color e.g. "#ff5722"
  sortOrder: number;
  updatedAt: number;
  /**
   * Stable slug linking this row back to a default-category template.
   * `null` for user-created custom categories.
   */
  templateKey: string | null;
  /**
   * `true` when the row is soft-deleted. Only the catalog endpoint
   * (`?includeArchived=true`) ever returns deleted rows; the active list
   * filters them out server-side. Soft-deleted rows are used by
   * `useCategoryLookup` to keep historic expenses' name/icon/color stable
   * after the category is archived.
   */
  deleted: boolean;
}

export interface CreateCategoryRequest {
  name: string;
  icon: string;
  color: string;
  sortOrder?: number;
}

export interface UpdateCategoryRequest {
  /**
   * When omitted, the existing name is preserved. When set to an empty
   * string the backend interprets it as "clear override" for templated
   * rows (the row falls back to the translated template label).
   */
  name?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}
