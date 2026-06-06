/**
 * In-memory `LocalStore` implementation used exclusively by Vitest unit
 * tests. Mirrors the semantics of the production `expo-sqlite` store:
 *
 *   - `projectFromEvent` UPSERTs with **strict `>`** last-write-wins.
 *   - `markAsDeleted` ONLY transitions to deleted (never resurrects),
 *     also with strict `>` last-write-wins.
 *   - `transaction` runs the closure on a snapshot of the state and
 *     atomically commits or rolls back on failure — so transactional
 *     correctness tests (atomic event + projection) catch the same bugs
 *     they would on real SQLite.
 *
 * This file deliberately lives under `src/test/` so production code
 * cannot import it. The interface contract is `LocalStore`.
 */
import type { LocalStore } from '../domain/localStore';
import type {
  Category,
  CategoryEvent,
  CoveredEvent,
  ExpenseEvent,
  ExpenseProjection,
} from '../domain/types';

interface State {
  events: ExpenseEvent[];
  projections: Map<string, ExpenseProjection>;
  /** Idempotency registry: eventId → original event timestamp. */
  processedEvents: Map<string, number>;
  categories: Map<string, Category>;
  categoryEvents: CategoryEvent[];
}

function snapshot(state: State): State {
  return {
    events: [...state.events],
    projections: new Map(state.projections),
    processedEvents: new Map(state.processedEvents),
    categories: new Map(state.categories),
    categoryEvents: [...state.categoryEvents],
  };
}

function restore(target: State, source: State): void {
  target.events.splice(0, target.events.length, ...source.events);
  target.projections.clear();
  for (const [key, value] of source.projections) target.projections.set(key, value);
  target.processedEvents.clear();
  for (const [id, ts] of source.processedEvents) target.processedEvents.set(id, ts);
  target.categories.clear();
  for (const [key, value] of source.categories) target.categories.set(key, value);
  target.categoryEvents.splice(
    0,
    target.categoryEvents.length,
    ...source.categoryEvents,
  );
}

export class InMemoryLocalStore implements LocalStore {
  private readonly state: State = {
    events: [],
    projections: new Map(),
    processedEvents: new Map(),
    categories: new Map(),
    categoryEvents: [],
  };

  /** Test helper — wipes everything in the same dependency order the SQLite
   *  test cleanup uses (`processed_events` → `expense_events` → `expense_projections`). */
  reset(): void {
    this.state.processedEvents.clear();
    this.state.events.length = 0;
    this.state.projections.clear();
    this.state.categories.clear();
    this.state.categoryEvents.length = 0;
  }

  // -- Test introspection helpers -----------------------------------------

  /** All events ever appended (test-only). */
  allEvents(): ReadonlyArray<ExpenseEvent> {
    return [...this.state.events];
  }

  /** All projections regardless of deleted state (test-only). */
  allProjections(): ReadonlyArray<ExpenseProjection> {
    return [...this.state.projections.values()];
  }

  /** All category events ever appended (test-only). */
  allCategoryEvents(): ReadonlyArray<CategoryEvent> {
    return [...this.state.categoryEvents];
  }

  /** All categories regardless of deleted state (test-only). */
  allCategories(): ReadonlyArray<Category> {
    return [...this.state.categories.values()];
  }

  // -- LocalStore implementation ------------------------------------------

  transaction = async <T>(action: (tx: LocalStore) => Promise<T>): Promise<T> => {
    const checkpoint = snapshot(this.state);
    try {
      // The in-memory store has only one underlying state object, so the
      // tx-bound store is just `this`. Production SQLite hands a proxy
      // bound to the exclusive transaction connection; we don't need
      // that distinction here because tests are single-threaded.
      return await action(this);
    } catch (err) {
      restore(this.state, checkpoint);
      throw err;
    }
  };

  async appendEvent(event: ExpenseEvent): Promise<void> {
    this.state.events.push(event);
  }

  async findUncommittedEvents(): Promise<ReadonlyArray<ExpenseEvent>> {
    return this.state.events
      .filter((e) => !e.committed)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async findAllEvents(): Promise<ReadonlyArray<ExpenseEvent>> {
    return this.state.events
      .slice()
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
      });
  }

  async markEventsCommitted(eventIds: ReadonlyArray<string>): Promise<void> {
    const set = new Set(eventIds);
    this.state.events.forEach((event, idx) => {
      if (set.has(event.eventId)) {
        this.state.events[idx] = { ...event, committed: true };
      }
    });
  }

  async projectFromEvent(projection: ExpenseProjection): Promise<number> {
    const existing = this.state.projections.get(projection.id);
    // Strict `>` matches the backend SQL: WHERE EXCLUDED.updated_at > expense_projections.updated_at
    if (existing && projection.updatedAt <= existing.updatedAt) {
      return 0;
    }
    this.state.projections.set(projection.id, projection);
    return 1;
  }

  async markAsDeleted(id: string, updatedAt: number): Promise<number> {
    const existing = this.state.projections.get(id);
    if (!existing) return 0;
    if (updatedAt <= existing.updatedAt) return 0;
    this.state.projections.set(id, { ...existing, deleted: true, updatedAt });
    return 1;
  }

  async findProjectionById(
    id: string,
  ): Promise<ExpenseProjection | undefined> {
    return this.state.projections.get(id);
  }

  async findActiveProjections(): Promise<ReadonlyArray<ExpenseProjection>> {
    return [...this.state.projections.values()].filter((p) => !p.deleted);
  }

  async findAllProjections(): Promise<ReadonlyArray<ExpenseProjection>> {
    return [...this.state.projections.values()];
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    return this.state.processedEvents.has(eventId);
  }

  async findAllProcessedEvents(): Promise<ReadonlyArray<CoveredEvent>> {
    return Array.from(this.state.processedEvents.entries()).map(
      ([eventId, timestamp]) => ({ eventId, timestamp }),
    );
  }

  async recordProcessedEvent(eventId: string, timestamp: number): Promise<void> {
    // INSERT OR IGNORE semantics — first write wins for the timestamp.
    if (!this.state.processedEvents.has(eventId)) {
      this.state.processedEvents.set(eventId, timestamp);
    }
  }

  async projectCategoryFromEvent(category: Category): Promise<number> {
    const existing = this.state.categories.get(category.id);
    // Strict `>` matches the SQLite SQL: WHERE EXCLUDED.updated_at > categories.updated_at
    if (existing && category.updatedAt <= existing.updatedAt) {
      return 0;
    }
    // Mirror the SQLite partial unique index on `template_key`
    // (active rows only): inserting a *new* row whose template_key collides
    // with another active row must fail, just as it would in production.
    // Updates to the existing row (same id) are allowed because the
    // `ON CONFLICT(id) DO UPDATE` path on SQLite does not trigger the
    // INSERT-side uniqueness check.
    if (!existing && category.templateKey !== undefined && !category.deleted) {
      for (const other of this.state.categories.values()) {
        if (
          other.id !== category.id &&
          other.templateKey === category.templateKey &&
          !other.deleted
        ) {
          throw new Error(
            `UNIQUE constraint failed: categories.template_key (${category.templateKey})`,
          );
        }
      }
    }
    this.state.categories.set(category.id, category);
    return 1;
  }

  async findCategoryById(id: string): Promise<Category | undefined> {
    return this.state.categories.get(id);
  }

  async findAllCategories(): Promise<ReadonlyArray<Category>> {
    return [...this.state.categories.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.updatedAt - b.updatedAt,
    );
  }

  async softDeleteCategory(id: string, updatedAt: number): Promise<number> {
    const existing = this.state.categories.get(id);
    if (!existing) return 0;
    if (updatedAt <= existing.updatedAt) return 0;
    this.state.categories.set(id, { ...existing, deleted: true, updatedAt });
    return 1;
  }

  async appendCategoryEvent(event: CategoryEvent): Promise<void> {
    this.state.categoryEvents.push(event);
  }

  async findUncommittedCategoryEvents(): Promise<ReadonlyArray<CategoryEvent>> {
    return this.state.categoryEvents
      .filter((e) => !e.committed)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async findAllCategoryEvents(): Promise<ReadonlyArray<CategoryEvent>> {
    return this.state.categoryEvents
      .slice()
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
      });
  }

  async markCategoryEventsCommitted(eventIds: ReadonlyArray<string>): Promise<void> {
    const set = new Set(eventIds);
    this.state.categoryEvents.forEach((event, idx) => {
      if (set.has(event.eventId)) {
        this.state.categoryEvents[idx] = { ...event, committed: true };
      }
    });
  }
}
