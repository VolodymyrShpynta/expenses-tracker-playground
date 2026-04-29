/**
 * Shared response handler for the JSON-returning REST endpoints in `src/api/`.
 * Throws an `Error` carrying the HTTP status and (best-effort) response body
 * for non-2xx responses; returns the parsed JSON otherwise.
 */
export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

/** Same as `handleResponse` but for endpoints that return no body. */
export async function expectOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
}
