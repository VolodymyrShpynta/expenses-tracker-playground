import keycloak from '../config/keycloak';
import i18n from '../i18n';

/**
 * Wrapper around fetch that automatically injects the Keycloak Bearer token.
 * Refreshes the token if it's about to expire before making the request.
 *
 * Also forwards the active i18n language as the `Accept-Language` header so
 * the backend can pick the matching default-categories template (and any
 * future locale-aware response). The caller can override by passing their
 * own `Accept-Language` in `init.headers`.
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Refresh token if it expires within the next 30 seconds
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

  return fetch(input, { ...init, headers });
}
