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
import type { LocalStore } from '../domain/localStore.ts';
import type { ExpenseEvent, ExpenseProjection } from '../domain/types.ts';

interface State {
  events: ExpenseEvent[];
  projections: Map<string, ExpenseProjection>;
  processedEvents: Set<string>;
}

function snapshot(state: State): State {
  return {
    events: [...state.events],
    projections: new Map(state.projections),
    processedEvents: new Set(state.processedEvents),
  };
}

function restore(target: State, source: State): void {
  target.events.splice(0, target.events.length, ...source.events);
  target.projections.clear();
  for (const [key, value] of source.projections) target.projections.set(key, value);
  target.processedEvents.clear();
  for (const id of source.processedEvents) target.processedEvents.add(id);
}

export class InMemoryLocalStore implements LocalStore {
  private readonly state: State = {
    events: [],
    projections: new Map(),
    processedEvents: new Set(),
  };

  /** Test helper — wipes everything in the same dependency order the SQLite
   *  test cleanup uses (`processed_events` → `expense_events` → `expense_projections`). */
  reset(): void {
    this.state.processedEvents.clear();
    this.state.events.length = 0;
    this.state.projections.clear();
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
}
