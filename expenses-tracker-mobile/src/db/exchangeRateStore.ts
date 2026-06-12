/**
 * SQLite-backed store for the `exchange_rates` cache (added in migration v2).
 *
 * Why a dedicated store and not part of `LocalStore`? Exchange rates are
 * a side-channel cache, not part of the event-sourced domain — they do
 * not participate in sync, are never appended as events, and follow a
 * trivial "fetch from API, replace local copy" lifecycle. Keeping them
 * out of `LocalStore` avoids polluting the sync surface and lets us test
 * the projection logic (pure TS in `src/domain/exchangeRates.ts`) without
 * touching `expo-sqlite`.
 *
 * Rate convention mirrors Frankfurter: `rate` is "1 base unit buys this
 * many quote units". Conversion direction lives in
 * `src/domain/exchangeRates.ts`.
 *
 * Sentinel `period_start = 'LATEST'` rows hold today's live rate, used as
 * the fallback when no monthly historical rate is available.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { HistoricalRates, LatestRates } from '../domain/exchangeRates';
import { withExclusiveWriteTransaction } from './transactions';

/** Sentinel `period_start` value reserved for the live fallback rate. */
export const LATEST_PERIOD = 'LATEST' as const;

/** One persisted exchange-rate row. */
export interface ExchangeRateRow {
  readonly base: string;
  readonly quote: string;
  /** "YYYY-MM-01" for a historical monthly rate, or `LATEST` sentinel. */
  readonly periodStart: string;
  readonly rate: number;
  /** Epoch millis when the row was fetched (used for cache freshness). */
  readonly fetchedAt: number;
}

interface ExchangeRateDbRow {
  readonly base: string;
  readonly quote: string;
  readonly period_start: string;
  readonly rate: number;
  readonly fetched_at: number;
}

function rowToRate(row: ExchangeRateDbRow): ExchangeRateRow {
  return {
    base: row.base,
    quote: row.quote,
    periodStart: row.period_start,
    rate: row.rate,
    fetchedAt: row.fetched_at,
  };
}

/** Public surface of the store; the implementation is in `createExchangeRateStore`. */
export interface ExchangeRateStore {
  /**
   * Insert or replace the given rows in a single transaction. Existing
   * rows for the same `(base, quote, period_start)` are overwritten —
   * Frankfurter republishes corrected rates occasionally and we want
   * the latest server value to win.
   */
  upsertRates(rows: ReadonlyArray<ExchangeRateRow>): Promise<void>;

  /**
   * Return all monthly historical rates for `base`, shaped for the
   * pure-TS conversion helper: `result[quote][monthKey] = rate`.
   * Excludes the `LATEST` sentinel rows.
   */
  findHistoricalRates(base: string): Promise<HistoricalRates>;

  /**
   * Return the latest live rates for `base` as a flat
   * `Record<quote, rate>`. Used as the fallback in `convertAmount`.
   * Empty object when nothing has been cached yet.
   */
  findLatestRates(base: string): Promise<LatestRates>;

  /**
   * Return the set of `monthKey` values already cached for `(base,
   * quote)`. Used by the sync hook to compute which months still need
   * to be fetched. Excludes the `LATEST` sentinel.
   */
  findCoveredMonths(base: string, quote: string): Promise<ReadonlySet<string>>;

  /**
   * Epoch millis of the most recent `LATEST` row for `base`, or `null`
   * if nothing is cached. Drives the "refresh once per day" gate in the
   * sync hook.
   */
  findLatestFetchedAt(base: string): Promise<number | null>;
}

/**
 * Construct a store bound to `db`. The factory shape mirrors
 * `createSqliteLocalStore` so the wiring in the database provider stays
 * uniform.
 */
export function createExchangeRateStore(db: SQLiteDatabase): ExchangeRateStore {
  return {
    async upsertRates(rows: ReadonlyArray<ExchangeRateRow>): Promise<void> {
      if (rows.length === 0) return;
      // Exclusive transaction so a partially-failed batch doesn't leave
      // the cache in a half-written state, and so concurrent writers on
      // the shared connection can't collide on BEGIN. Per the Expo
      // contract every query MUST go through the `txn` proxy — the
      // outer `db` handle would deadlock against the exclusive transaction.
      // `withExclusiveWriteTransaction` also sets `busy_timeout` so a
      // concurrent writer on another connection waits for the lock
      // instead of failing fast with `database is locked`.
      await withExclusiveWriteTransaction(db, async (txn) => {
        for (const row of rows) {
          await txn.runAsync(
            `INSERT INTO exchange_rates (base, quote, period_start, rate, fetched_at)
               VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(base, quote, period_start) DO UPDATE SET
               rate       = excluded.rate,
               fetched_at = excluded.fetched_at`,
            row.base,
            row.quote,
            row.periodStart,
            row.rate,
            row.fetchedAt,
          );
        }
      });
    },

    async findHistoricalRates(base: string): Promise<HistoricalRates> {
      const rows = await db.getAllAsync<ExchangeRateDbRow>(
        `SELECT base, quote, period_start, rate, fetched_at
           FROM exchange_rates
          WHERE base = ? AND period_start <> ?`,
        base,
        LATEST_PERIOD,
      );
      const grouped: Record<string, Record<string, number>> = {};
      for (const r of rows.map(rowToRate)) {
        const byQuote = grouped[r.quote] ?? (grouped[r.quote] = {});
        byQuote[r.periodStart] = r.rate;
      }
      return grouped;
    },

    async findLatestRates(base: string): Promise<LatestRates> {
      const rows = await db.getAllAsync<ExchangeRateDbRow>(
        `SELECT base, quote, period_start, rate, fetched_at
           FROM exchange_rates
          WHERE base = ? AND period_start = ?`,
        base,
        LATEST_PERIOD,
      );
      const out: Record<string, number> = {};
      for (const r of rows.map(rowToRate)) {
        out[r.quote] = r.rate;
      }
      return out;
    },

    async findCoveredMonths(base: string, quote: string): Promise<ReadonlySet<string>> {
      const rows = await db.getAllAsync<{ period_start: string }>(
        `SELECT period_start FROM exchange_rates
          WHERE base = ? AND quote = ? AND period_start <> ?`,
        base,
        quote,
        LATEST_PERIOD,
      );
      return new Set(rows.map((r) => r.period_start));
    },

    async findLatestFetchedAt(base: string): Promise<number | null> {
      const row = await db.getFirstAsync<{ fetched_at: number }>(
        `SELECT MAX(fetched_at) AS fetched_at FROM exchange_rates
          WHERE base = ? AND period_start = ?`,
        base,
        LATEST_PERIOD,
      );
      return row?.fetched_at ?? null;
    },
  };
}
