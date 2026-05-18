/**
 * Tests for the Frankfurter client — exercises URL composition, response
 * parsing, and error handling with a mocked global `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchLatestRates, fetchMonthlySeries } from './exchangeRates';
import type { FrankfurterRate } from './exchangeRates';

interface MockResponseInit {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

function mockFetchOnce(init: MockResponseInit): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
  }));
  // @ts-expect-error — assigning a partial Response shape to the global is fine
  // for these tests; the production code only touches `ok`, `status`, `json`.
  globalThis.fetch = fn;
  return fn;
}

const sampleRates: ReadonlyArray<FrankfurterRate> = [
  { date: '2024-01-02', base: 'USD', quote: 'EUR', rate: 0.92 },
  { date: '2024-02-01', base: 'USD', quote: 'EUR', rate: 0.93 },
];

describe('fetchLatestRates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    // @ts-expect-error — restore the env for the next test file.
    delete globalThis.fetch;
  });

  it('hits /v2/rates with the base parameter when no quotes are passed', async () => {
    const fn = mockFetchOnce({ ok: true, status: 200, body: sampleRates });
    await fetchLatestRates('USD');
    expect(fn).toHaveBeenCalledWith('https://api.frankfurter.dev/v2/rates?base=USD');
  });

  it('joins quotes with commas when provided', async () => {
    const fn = mockFetchOnce({ ok: true, status: 200, body: sampleRates });
    await fetchLatestRates('USD', ['EUR', 'GBP']);
    expect(fn).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR%2CGBP',
    );
  });

  it('throws when the response is not OK and includes the upstream message', async () => {
    mockFetchOnce({ ok: false, status: 400, body: { message: 'bad base' } });
    await expect(fetchLatestRates('BOGUS')).rejects.toThrow(/400.*bad base/);
  });
});

describe('fetchMonthlySeries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    // @ts-expect-error — restore the env for the next test file.
    delete globalThis.fetch;
  });

  it('short-circuits to an empty array when quotes is empty (avoids a useless request)', async () => {
    const fn = mockFetchOnce({ ok: true, status: 200, body: [] });
    const result = await fetchMonthlySeries('USD', '2020-01-01', []);
    expect(result).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('includes from, group=month, and joined quotes in the query string', async () => {
    const fn = mockFetchOnce({ ok: true, status: 200, body: sampleRates });
    await fetchMonthlySeries('USD', '2020-01-01', ['EUR', 'GBP']);
    const url = (fn.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toContain('base=USD');
    expect(url).toContain('from=2020-01-01');
    expect(url).toContain('group=month');
    expect(url).toContain('quotes=EUR%2CGBP');
    expect(url).not.toContain('to=');
  });

  it('passes the optional to parameter when provided', async () => {
    const fn = mockFetchOnce({ ok: true, status: 200, body: sampleRates });
    await fetchMonthlySeries('USD', '2020-01-01', ['EUR'], '2024-12-01');
    const url = (fn.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toContain('to=2024-12-01');
  });

  it('rejects when the body is not an array', async () => {
    mockFetchOnce({ ok: true, status: 200, body: { foo: 'bar' } });
    await expect(fetchMonthlySeries('USD', '2020-01-01', ['EUR'])).rejects.toThrow(
      /not an array/,
    );
  });
});
