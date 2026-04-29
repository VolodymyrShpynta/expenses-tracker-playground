import { describe, expect, it } from 'vitest';
import { expectOk, handleResponse } from './handleResponse.ts';

function jsonResponse<T>(body: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('handleResponse', () => {
  it('returns parsed JSON on a 2xx response', async () => {
    const res = jsonResponse({ id: 'abc', amount: 42 });
    await expect(handleResponse<{ id: string; amount: number }>(res)).resolves.toEqual({
      id: 'abc',
      amount: 42,
    });
  });

  it('throws an Error containing the status and body on a non-2xx response', async () => {
    const res = new Response('boom', { status: 500 });
    await expect(handleResponse(res)).rejects.toThrow('HTTP 500: boom');
  });

  it('still throws when the error body is unreadable', async () => {
    // Response whose body cannot be consumed twice; first .text() succeeds with '',
    // but here we simulate a body-less 4xx.
    const res = new Response(null, { status: 404 });
    await expect(handleResponse(res)).rejects.toThrow('HTTP 404');
  });
});

describe('expectOk', () => {
  it('resolves silently on a 2xx response', async () => {
    await expect(expectOk(new Response(null, { status: 204 }))).resolves.toBeUndefined();
  });

  it('throws on a non-2xx response', async () => {
    const res = new Response('nope', { status: 400 });
    await expect(expectOk(res)).rejects.toThrow('HTTP 400: nope');
  });
});
