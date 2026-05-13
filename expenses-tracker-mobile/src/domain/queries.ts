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
}

export interface ExpenseQueryService {
  findAllExpenses(): Promise<ReadonlyArray<ExpenseProjection>>;
  findExpenseById(id: string): Promise<ExpenseProjection | undefined>;
  exists(id: string): Promise<boolean>;
}

export function createExpenseQueryService(deps: QueryServiceDeps): ExpenseQueryService {
  const { store } = deps;

  return {
    findAllExpenses: () => store.findActiveProjections(),

    async findExpenseById(id) {
      const projection = await store.findProjectionById(id);
      if (!projection || projection.deleted) return undefined;
      return projection;
    },

    async exists(id) {
      const projection = await store.findProjectionById(id);
      return projection !== undefined && !projection.deleted;
    },
  };
}
