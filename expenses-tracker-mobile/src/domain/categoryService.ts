/**
 * Category service — event-sourced CRUD over the local `categories` table.
 *
 * Each mutating method:
 *   1. Builds a fresh `CategoryPayload` with `updatedAt = time.nowMs()`.
 *   2. Inside a single SQLite transaction:
 *        a. Appends the event to `category_events`.
 *        b. Projects (or soft-deletes) the row in `categories`.
 *
 * Mirrors `ExpenseCommandService` — including the strict-`>` LWW rule
 * inside `projectCategoryFromEvent`. The transactional boundary is
 * enforced by `LocalStore.transaction`; do NOT split steps 2a and 2b
 * across separate transactions or sync conflict resolution breaks.
 *
 * NOTE: the backend's `CategoryService` mutates the `categories` table
 * directly (no events) — categories there are not part of the sync file.
 * Mobile takes the event-sourced route so cloud-drive sync converges
 * categories across devices the same way it converges expenses.
 *
 * `id` and time are passed in via `IdGenerator` / `TimeProvider` so tests
 * can pin them deterministically.
 */
import type { LocalStore } from './localStore';
import { categoryPayloadToCategory } from './mapping';
import type { Category, CategoryEvent, CategoryPayload, EventType } from './types';
import type { ExpenseCommandService, IdGenerator } from './commands';
import type { ExpenseQueryService } from './queries';
import type { TimeProvider } from '../utils/time';
import { nextUpdatedAt } from '../utils/time';
import { DEFAULT_CATEGORY_TEMPLATES, defaultTemplateId } from './defaultCategories';

export interface CategoryServiceDeps {
  readonly store: LocalStore;
  readonly time: TimeProvider;
  readonly ids: IdGenerator;
  /** JSON serializer (injected so tests can pin formatting). Default: JSON.stringify. */
  readonly serializePayload?: (payload: CategoryPayload) => string;
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
   * Find every category — including soft-deleted rows. The UI splits
   * "active" vs "archived" client-side so the lookup hook can keep
   * historic expenses' display fields stable.
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
   * Soft-delete every active category, then re-seed the defaults.
   * Existing expenses keep pointing at the (now archived) old category
   * rows so their display data stays intact via `useCategoryLookup`.
   */
  resetToDefaults(): Promise<{ readonly archived: number; readonly seeded: number }>;

  /**
   * Seed default category templates on first launch. Idempotent — does
   * nothing if any category already exists.
   */
  seedDefaultsIfEmpty(): Promise<number>;
}

export function createCategoryService(deps: CategoryServiceDeps): CategoryService {
  const { store, time, ids, serializePayload = JSON.stringify } = deps;

  /**
   * Append a category event inside the current transaction. Caller is
   * responsible for wrapping the call in `store.transaction(...)`.
   */
  async function appendCategoryEventInTx(
    eventType: EventType,
    categoryId: string,
    payload: CategoryPayload,
  ): Promise<CategoryEvent> {
    const event: CategoryEvent = {
      eventId: ids.newUuid(),
      timestamp: time.nowMs(),
      eventType,
      categoryId,
      payload: serializePayload(payload),
      committed: false,
    };
    await store.appendCategoryEvent(event);
    return event;
  }

  function buildPayload(
    id: string,
    now: number,
    fields: {
      readonly name?: string;
      readonly templateKey?: string;
      readonly icon: string;
      readonly color: string;
      readonly sortOrder: number;
      readonly deleted: boolean;
    },
  ): CategoryPayload {
    return {
      id,
      icon: fields.icon,
      color: fields.color,
      sortOrder: fields.sortOrder,
      updatedAt: now,
      deleted: fields.deleted,
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.templateKey !== undefined ? { templateKey: fields.templateKey } : {}),
    };
  }

  /** Atomically append a CREATED/UPDATED event and LWW-project it. */
  async function recordCreateOrUpdate(
    eventType: 'CREATED' | 'UPDATED',
    payload: CategoryPayload,
  ): Promise<Category> {
    return store.transaction(async () => {
      await appendCategoryEventInTx(eventType, payload.id, payload);
      const category = categoryPayloadToCategory(payload);
      await store.projectCategoryFromEvent(category);
      return category;
    });
  }

  /**
   * Atomically append a DELETED event and soft-delete the row. Reads the
   * latest `existing` row inside the transaction to embed the last-known
   * payload in the event (so peers can resolve resurrection conflicts).
   *
   * Returns `true` when the soft-delete affected a row, `false` when the
   * row was already gone or had a newer `updated_at`.
   */
  async function recordDelete(existing: Category): Promise<boolean> {
    // See `updateExpense` for the rationale on bumping above existing.
    const now = nextUpdatedAt(time, existing.updatedAt);
    const payload = buildPayload(existing.id, now, {
      icon: existing.icon,
      color: existing.color,
      sortOrder: existing.sortOrder,
      deleted: true,
      ...(existing.name !== undefined ? { name: existing.name } : {}),
      ...(existing.templateKey !== undefined
        ? { templateKey: existing.templateKey }
        : {}),
    });
    return store.transaction(async () => {
      await appendCategoryEventInTx('DELETED', existing.id, payload);
      const changes = await store.softDeleteCategory(existing.id, now);
      return changes > 0;
    });
  }

  /**
   * Build the CREATED payload for a default template seed row.
   *
   * The category id is derived deterministically from `templateKey` (see
   * `defaultTemplateId`) so peer devices converge on the same row when
   * their seed CREATED events meet via cloud-drive sync or file import.
   */
  function seedTemplatePayload(
    template: (typeof DEFAULT_CATEGORY_TEMPLATES)[number],
  ): CategoryPayload {
    return buildPayload(defaultTemplateId(template.templateKey), time.nowMs(), {
      templateKey: template.templateKey,
      icon: template.icon,
      color: template.color,
      sortOrder: template.sortOrder,
      deleted: false,
    });
  }

  return {
    findAllCategories: () => store.findAllCategories(),

    async createCategory(cmd) {
      const payload = buildPayload(ids.newUuid(), time.nowMs(), {
        name: cmd.name,
        icon: cmd.icon,
        color: cmd.color,
        sortOrder: cmd.sortOrder ?? 0,
        deleted: false,
      });
      return recordCreateOrUpdate('CREATED', payload);
    },

    async updateCategory(id, cmd) {
      const existing = await store.findCategoryById(id);
      if (!existing || existing.deleted) return undefined;

      const name = cmd.name ?? existing.name;
      // Cap above the existing row's updatedAt so the strict-`>` LWW
      // UPSERT inside `projectCategoryFromEvent` never silently drops
      // this write — see `nextUpdatedAt` for the full rationale.
      const now = nextUpdatedAt(time, existing.updatedAt);
      const payload = buildPayload(id, now, {
        icon: cmd.icon ?? existing.icon,
        color: cmd.color ?? existing.color,
        sortOrder: cmd.sortOrder ?? existing.sortOrder,
        deleted: false,
        ...(name !== undefined ? { name } : {}),
        ...(existing.templateKey !== undefined
          ? { templateKey: existing.templateKey }
          : {}),
      });
      return recordCreateOrUpdate('UPDATED', payload);
    },

    async deleteCategory(id) {
      const existing = await store.findCategoryById(id);
      if (!existing || existing.deleted) return false;
      return recordDelete(existing);
    },

    async restoreCategory(id) {
      const existing = await store.findCategoryById(id);
      if (!existing) return undefined;

      // See `updateCategory` for the rationale on bumping above existing.
      const now = nextUpdatedAt(time, existing.updatedAt);
      const payload = buildPayload(id, now, {
        icon: existing.icon,
        color: existing.color,
        sortOrder: existing.sortOrder,
        deleted: false,
        ...(existing.name !== undefined ? { name: existing.name } : {}),
        ...(existing.templateKey !== undefined
          ? { templateKey: existing.templateKey }
          : {}),
      });
      return recordCreateOrUpdate('UPDATED', payload);
    },

    async mergeCategories(sourceId, targetId, expenseQueries, expenseCommands) {
      if (sourceId === targetId) return { movedExpenses: 0 };
      const all = await expenseQueries.findAllExpenses();
      const toMove = all.filter((e) => e.categoryId === sourceId);
      for (const e of toMove) {
        await expenseCommands.updateExpense(e.id, { categoryId: targetId });
      }
      const source = await store.findCategoryById(sourceId);
      if (source && !source.deleted) {
        await recordDelete(source);
      }
      return { movedExpenses: toMove.length };
    },

    async resetToDefaults() {
      const existing = await store.findAllCategories();
      const active = existing.filter((c) => !c.deleted);
      for (const c of active) {
        await recordDelete(c);
      }
      // Re-seed unconditionally: `seedDefaultsIfEmpty` would skip because
      // archived rows still exist, so we mirror its body here.
      for (const template of DEFAULT_CATEGORY_TEMPLATES) {
        await recordCreateOrUpdate('CREATED', seedTemplatePayload(template));
      }
      return { archived: active.length, seeded: DEFAULT_CATEGORY_TEMPLATES.length };
    },

    async seedDefaultsIfEmpty() {
      const existing = await store.findAllCategories();
      if (existing.length > 0) return 0;
      for (const template of DEFAULT_CATEGORY_TEMPLATES) {
        await recordCreateOrUpdate('CREATED', seedTemplatePayload(template));
      }
      return DEFAULT_CATEGORY_TEMPLATES.length;
    },
  };
}
