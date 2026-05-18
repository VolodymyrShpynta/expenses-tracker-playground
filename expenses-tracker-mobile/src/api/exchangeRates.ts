/**
 * Frankfurter v2 client — historical + latest FX rates.
 *
 * Frankfurter (api.frankfurter.dev) is free, requires no API key, and
 * publishes ECB-backed rates back to 1948 with a built-in monthly
 * downsample (`group=month`) that fits the mobile app's "rate per expense
 * month" model.
 *
 * Pure TypeScript: the only runtime dependency is the global `fetch`,
 * which Hermes provides on every supported RN platform. The module has
 * no React, no React Native, and no Expo imports so it can be unit-tested
 * under Vitest with a mocked `fetch`.
 *
 * Rate semantics (preserved from upstream): `rate` is "1 unit of `base`
 * buys this many `quote` units". To convert an amount in `quote` to
 * `base`, divide by `rate`.
 */

const BASE_URL = 'https://api.frankfurter.dev/v2';

/** One row from a Frankfurter `/v2/rates` response. */
export interface FrankfurterRate {
  /** ISO date the rate is effective on (Frankfurter only publishes business days). */
  readonly date: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: number;
}

interface FrankfurterErrorBody {
  readonly message?: string;
}

/**
 * Build a query string while skipping `undefined` values. Native
 * `URLSearchParams` happily stringifies `undefined` as the literal text
 * "undefined" which then becomes a 400 from Frankfurter — explicit skip.
 */
function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function getJson(url: string): Promise<FrankfurterRate[]> {
  const res = await fetch(url);
  if (!res.ok) {
    // Frankfurter returns a JSON body with a `message` field on errors;
    // surface it verbatim to make troubleshooting easier in dev logs.
    let detail = '';
    try {
      const body = (await res.json()) as FrankfurterErrorBody;
      if (body.message) detail = `: ${body.message}`;
    } catch {
      /* body wasn't JSON — ignore */
    }
    throw new Error(`Frankfurter request failed (${res.status})${detail}`);
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error('Frankfurter response was not an array');
  }
  return body as FrankfurterRate[];
}

/**
 * Fetch the most recent (typically previous business day) rates for the
 * given `base` against every currency Frankfurter tracks, or a filtered
 * subset when `quotes` is provided.
 */
export async function fetchLatestRates(
  base: string,
  quotes?: ReadonlyArray<string>,
): Promise<ReadonlyArray<FrankfurterRate>> {
  const query = buildQuery({
    base,
    quotes: quotes && quotes.length > 0 ? quotes.join(',') : undefined,
  });
  return getJson(`${BASE_URL}/rates${query}`);
}

/**
 * Fetch a monthly time series of rates for `base` against `quotes`, from
 * `from` (inclusive) through `to` (inclusive; defaults to today).
 *
 * `from` must be a "YYYY-MM-DD" string — the first day of the earliest
 * month we need. Frankfurter's `group=month` downsample emits exactly one
 * row per month per quote (the first available business day in that
 * month), which is exactly what the projection layer wants.
 */
export async function fetchMonthlySeries(
  base: string,
  from: string,
  quotes: ReadonlyArray<string>,
  to?: string,
): Promise<ReadonlyArray<FrankfurterRate>> {
  if (quotes.length === 0) return [];
  const query = buildQuery({
    base,
    from,
    quotes: quotes.join(','),
    group: 'month',
    ...(to !== undefined ? { to } : {}),
  });
  return getJson(`${BASE_URL}/rates${query}`);
}
