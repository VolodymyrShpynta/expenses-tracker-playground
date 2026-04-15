/**
 * Category types matching the backend DTOs.
 */

export interface Category {
  id: string;
  name: string;
  icon: string; // icon key mapped to MUI icon component on frontend
  color: string; // hex color e.g. "#ff5722"
  sortOrder: number;
  updatedAt: number;
}

export interface CreateCategoryRequest {
  name: string;
  icon: string;
  color: string;
  sortOrder?: number;
}

export interface UpdateCategoryRequest {
  name?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}
