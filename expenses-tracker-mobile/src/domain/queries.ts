/**
 * Query-side service for expense reads (CQRS read side).
 *
 * Direct port of the backend's `ExpenseQueryService`. Reads only the
 * projection table. Soft-deleted rows are filtered out — `findExpenseById`
 * returns `undefined` for a soft-deleted expense even when the row still
 * exists physically (resurrection path).
 */
import type { LocalStore } from './localStore';
import type { ExpenseProjection } from './types';

export interface QueryServiceDeps {
  readonly store: LocalStore;
  readonly userId: string;
}

export interface ExpenseQueryService {
  findAllExpenses(): Promise<ReadonlyArray<ExpenseProjection>>;
  findExpenseById(id: string): Promise<ExpenseProjection | undefined>;
  exists(id: string): Promise<boolean>;
}

export function createExpenseQueryService(deps: QueryServiceDeps): ExpenseQueryService {
  const { store, userId } = deps;

  return {
    findAllExpenses: () => store.findActiveProjections(userId),

    async findExpenseById(id) {
      const projection = await store.findProjectionById(id, userId);
      if (!projection || projection.deleted) return undefined;
      return projection;
    },

    async exists(id) {
      const projection = await store.findProjectionById(id, userId);
      return projection !== undefined && !projection.deleted;
    },
  };
}
