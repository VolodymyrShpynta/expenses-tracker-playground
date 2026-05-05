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
import type { Category, ExpenseEvent, ExpenseProjection } from '../domain/types';

interface State {
  events: ExpenseEvent[];
  projections: Map<string, ExpenseProjection>;
  processedEvents: Set<string>;
  categories: Map<string, Category>;
}

function snapshot(state: State): State {
  return {
    events: [...state.events],
    projections: new Map(state.projections),
    processedEvents: new Set(state.processedEvents),
    categories: new Map(state.categories),
  };
}

function restore(target: State, source: State): void {
  target.events.splice(0, target.events.length, ...source.events);
  target.projections.clear();
  for (const [key, value] of source.projections) target.projections.set(key, value);
  target.processedEvents.clear();
  for (const id of source.processedEvents) target.processedEvents.add(id);
  target.categories.clear();
  for (const [key, value] of source.categories) target.categories.set(key, value);
}

export class InMemoryLocalStore implements LocalStore {
  private readonly state: State = {
    events: [],
    projections: new Map(),
    processedEvents: new Set(),
    categories: new Map(),
  };

  /** Test helper — wipes everything in the same dependency order the SQLite
   *  test cleanup uses (`processed_events` → `expense_events` → `expense_projections`). */
  reset(): void {
    this.state.processedEvents.clear();
    this.state.events.length = 0;
    this.state.projections.clear();
    this.state.categories.clear();
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

  // -- LocalStore implementation ------------------------------------------

  transaction = async <T>(action: () => Promise<T>): Promise<T> => {
    const checkpoint = snapshot(this.state);
    try {
      return await action();
    } catch (err) {
      restore(this.state, checkpoint);
      throw err;
    }
  };

  async appendEvent(event: ExpenseEvent): Promise<void> {
    this.state.events.push(event);
  }

  async findUncommittedEvents(userId: string): Promise<ReadonlyArray<ExpenseEvent>> {
    return this.state.events
      .filter((e) => !e.committed && e.userId === userId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async findAllEvents(userId: string): Promise<ReadonlyArray<ExpenseEvent>> {
    return this.state.events
      .filter((e) => e.userId === userId)
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
    userId: string,
  ): Promise<ExpenseProjection | undefined> {
    const found = this.state.projections.get(id);
    if (!found || found.userId !== userId) return undefined;
    return found;
  }

  async findActiveProjections(userId: string): Promise<ReadonlyArray<ExpenseProjection>> {
    return [...this.state.projections.values()].filter(
      (p) => !p.deleted && p.userId === userId,
    );
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    return this.state.processedEvents.has(eventId);
  }

  async recordProcessedEvent(eventId: string): Promise<void> {
    this.state.processedEvents.add(eventId);
  }

  async upsertCategory(category: Category): Promise<void> {
    this.state.categories.set(category.id, category);
  }

  async findCategoryById(id: string, userId: string): Promise<Category | undefined> {
    const found = this.state.categories.get(id);
    if (!found || found.userId !== userId) return undefined;
    return found;
  }

  async findAllCategories(userId: string): Promise<ReadonlyArray<Category>> {
    return [...this.state.categories.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.updatedAt - b.updatedAt);
  }

  async softDeleteCategory(id: string, userId: string, updatedAt: number): Promise<number> {
    const existing = this.state.categories.get(id);
    if (!existing || existing.userId !== userId) return 0;
    if (updatedAt <= existing.updatedAt) return 0;
    this.state.categories.set(id, { ...existing, deleted: true, updatedAt });
    return 1;
  }
}
