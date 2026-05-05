/**
 * Category service — CRUD operations over the local `categories` table.
 *
 * Categories are reference data, not event-sourced — there is no event
 * store table for them. This mirrors the backend's `CategoryService`
 * (which writes directly through `CategoryRepository`).
 *
 * `userId`, `id`, and time are passed in via `IdGenerator` / `TimeProvider`
 * so tests can pin them deterministically.
 */
import type { LocalStore } from './localStore';
import type { Category } from './types';
import type { ExpenseCommandService, IdGenerator } from './commands';
import type { ExpenseQueryService } from './queries';
import type { TimeProvider } from '../utils/time';
import { DEFAULT_CATEGORY_TEMPLATES } from './defaultCategories';

export interface CategoryServiceDeps {
  readonly store: LocalStore;
  readonly time: TimeProvider;
  readonly ids: IdGenerator;
  readonly userId: string;
}

export interface CreateCategoryCommand {
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder?: number;
}

export interface UpdateCategoryCommand {
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly sortOrder?: number;
}

export interface CategoryService {
  /**
   * Find every category for the user — including soft-deleted rows. The
   * UI splits "active" vs "archived" client-side so the lookup hook can
   * keep historic expenses' display fields stable.
   */
  findAllCategories(): Promise<ReadonlyArray<Category>>;

  createCategory(cmd: CreateCategoryCommand): Promise<Category>;
  updateCategory(id: string, cmd: UpdateCategoryCommand): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;

  /**
   * Restore a soft-deleted category by clearing its `deleted` flag. Used
   * by the duplicate-name flow: when the user tries to create a category
   * whose name matches an archived row, we offer "restore" instead.
   */
  restoreCategory(id: string): Promise<Category | undefined>;

  /**
   * Reassign every active expense currently pointing at `sourceId` to
   * `targetId`, then soft-delete the source. The source/target ids must
   * differ and both must be active.
   *
   * `expenseQueries` and `expenseCommands` are passed in so the merge can
   * be initiated by a UI component without the category service holding
   * a reference to the expense services (which would create a circular
   * domain dependency).
   */
  mergeCategories(
    sourceId: string,
    targetId: string,
    expenseQueries: ExpenseQueryService,
    expenseCommands: ExpenseCommandService,
  ): Promise<{ readonly movedExpenses: number }>;

  /**
   * Soft-delete every active category for the user, then re-seed the
   * defaults. Existing expenses keep pointing at the (now archived) old
   * category rows so their display data stays intact via
   * `useCategoryLookup`.
   */
  resetToDefaults(): Promise<{ readonly archived: number; readonly seeded: number }>;

  /**
   * Seed default category templates on first launch. Idempotent — does
   * nothing if any category already exists for the user.
   */
  seedDefaultsIfEmpty(): Promise<number>;
}

export function createCategoryService(deps: CategoryServiceDeps): CategoryService {
  const { store, time, ids, userId } = deps;

  return {
    findAllCategories: () => store.findAllCategories(userId),

    async createCategory(cmd) {
      const now = time.nowMs();
      const category: Category = {
        id: ids.newUuid(),
        name: cmd.name,
        icon: cmd.icon,
        color: cmd.color,
        sortOrder: cmd.sortOrder ?? 0,
        updatedAt: now,
        deleted: false,
        userId,
      };
      await store.upsertCategory(category);
      return category;
    },

    async updateCategory(id, cmd) {
      const existing = await store.findCategoryById(id, userId);
      if (!existing || existing.deleted) return undefined;

      const next: Category = {
        ...existing,
        updatedAt: time.nowMs(),
        ...(cmd.name !== undefined ? { name: cmd.name } : {}),
        ...(cmd.icon !== undefined ? { icon: cmd.icon } : {}),
        ...(cmd.color !== undefined ? { color: cmd.color } : {}),
        ...(cmd.sortOrder !== undefined ? { sortOrder: cmd.sortOrder } : {}),
      };
      await store.upsertCategory(next);
      return next;
    },

    async deleteCategory(id) {
      const changes = await store.softDeleteCategory(id, userId, time.nowMs());
      return changes > 0;
    },

    async restoreCategory(id) {
      const existing = await store.findCategoryById(id, userId);
      if (!existing) return undefined;
      const next: Category = { ...existing, deleted: false, updatedAt: time.nowMs() };
      await store.upsertCategory(next);
      return next;
    },

    async mergeCategories(sourceId, targetId, expenseQueries, expenseCommands) {
      if (sourceId === targetId) return { movedExpenses: 0 };
      const all = await expenseQueries.findAllExpenses();
      const toMove = all.filter((e) => e.categoryId === sourceId);
      for (const e of toMove) {
        await expenseCommands.updateExpense(e.id, { categoryId: targetId });
      }
      await store.softDeleteCategory(sourceId, userId, time.nowMs());
      return { movedExpenses: toMove.length };
    },

    async resetToDefaults() {
      const existing = await store.findAllCategories(userId);
      const active = existing.filter((c) => !c.deleted);
      const now = time.nowMs();
      for (const c of active) {
        await store.softDeleteCategory(c.id, userId, now);
      }
      // Re-seed unconditionally: `seedDefaultsIfEmpty` would skip because
      // archived rows still exist, so we mirror its body here.
      for (const template of DEFAULT_CATEGORY_TEMPLATES) {
        await store.upsertCategory({
          id: ids.newUuid(),
          templateKey: template.templateKey,
          icon: template.icon,
          color: template.color,
          sortOrder: template.sortOrder,
          updatedAt: time.nowMs(),
          deleted: false,
          userId,
        });
      }
      return { archived: active.length, seeded: DEFAULT_CATEGORY_TEMPLATES.length };
    },

    async seedDefaultsIfEmpty() {
      const existing = await store.findAllCategories(userId);
      if (existing.length > 0) return 0;
      const now = time.nowMs();
      for (const template of DEFAULT_CATEGORY_TEMPLATES) {
        await store.upsertCategory({
          id: ids.newUuid(),
          templateKey: template.templateKey,
          icon: template.icon,
          color: template.color,
          sortOrder: template.sortOrder,
          updatedAt: now,
          deleted: false,
          userId,
        });
      }
      return DEFAULT_CATEGORY_TEMPLATES.length;
    },
  };
}
