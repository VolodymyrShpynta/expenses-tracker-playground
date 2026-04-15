import keycloak from '../config/keycloak.ts';

/**
 * Wrapper around fetch that automatically injects the Keycloak Bearer token.
 * Refreshes the token if it's about to expire before making the request.
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

  return fetch(input, { ...init, headers });
}
