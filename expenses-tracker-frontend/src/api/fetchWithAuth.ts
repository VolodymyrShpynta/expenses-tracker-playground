import keycloak from '../config/keycloak';
import i18n from '../i18n';

/**
 * Wrapper around `fetch` that automatically injects the Keycloak Bearer
 * token, refreshing it if it expires within the next 30 seconds.
 *
 * Also forwards the active i18n language as the `Accept-Language` header so
 * the backend can pick the matching default-categories template (and any
 * future locale-aware response). The caller can override by passing their
 * own `Accept-Language` in `init.headers`.
 *
 * **Backend-initiated session revocation.** The resource server returns
 * `401 + {"error":"session_revoked"}` when the JWT was issued before a
 * recorded revocation cutoff (sign-out-everywhere, admin kick, or
 * post-erasure cleanup). The token itself is still cryptographically
 * valid, so the keycloak-js refresh dance would happily keep re-using
 * it — forcing a fresh login is the only recovery. The response is
 * cloned before parsing so the caller still gets to read the original
 * body if it wants to surface the message.
 *
 * `keycloak.login()` triggers a full-page redirect; awaiting it means
 * the subsequent `throw` only fires in the rare case the redirect
 * doesn't happen, which is exactly the safety-net semantics we want
 * (and silences `no-floating-promises`).
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  await keycloak.updateToken(30).catch(() => {
    keycloak.login();
    throw new Error('Session expired');
  });

  const headers = new Headers(init?.headers);
  if (keycloak.token) {
    headers.set('Authorization', `Bearer ${keycloak.token}`);
  }
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', i18n.language || 'en');
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401 && (await isSessionRevoked(response))) {
    await keycloak.login();
    throw new Error('Session revoked');
  }

  return response;
}

/**
 * Best-effort check for the backend's `session_revoked` marker on a
 * 401 response. Returns `false` if the body is missing, not JSON, or
 * doesn't carry that marker — never throws, so the caller can keep
 * the happy-path control flow linear.
 */
async function isSessionRevoked(response: Response): Promise<boolean> {
  const body = await response
    .clone()
    .json()
    .catch(() => null) as { error?: unknown } | null;
  return body?.error === 'session_revoked';
}
