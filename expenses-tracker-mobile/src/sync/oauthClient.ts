/**
 * Shared OAuth + secure-token plumbing for the cloud-drive adapters.
 *
 * Responsibilities (DRY across providers):
 *   - PKCE code-challenge generation via `expo-auth-session`.
 *   - Persisted token storage in `expo-secure-store`
 *     (access token + refresh token + expiry).
 *   - Automatic refresh when an access token is within
 *     `REFRESH_LEEWAY_MS` of expiry.
 *   - Single-flight refresh — if two concurrent requests both notice an
 *     expired token, only one POST hits the token endpoint.
 *
 * Each provider passes its own `OAuthConfig` (endpoints, client id, scope).
 * No provider-specific logic lives in this module.
 *
 * NOT covered by Vitest: this module imports `expo-auth-session` and
 * `expo-secure-store` (native modules). Real-device verification happens
 * via the Expo dev client.
 */
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

/** Refresh `REFRESH_LEEWAY_MS` before actual expiry to avoid 401s in flight. */
const REFRESH_LEEWAY_MS = 60_000;

export interface OAuthConfig {
  /** Provider-stable identifier used as the SecureStore key prefix. */
  readonly providerKey: string;
  readonly clientId: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly revocationEndpoint?: string;
  readonly scopes: ReadonlyArray<string>;
  /** Custom URI scheme registered in `app.json`. */
  readonly redirectScheme: string;
  /** Path on the redirect URI (defaults to `'redirect'`). */
  readonly redirectPath?: string;
}

interface StoredTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch ms when `accessToken` expires. */
  readonly expiresAt: number;
}

/** Public surface of the helper — what each adapter consumes. */
export interface OAuthClient {
  isSignedIn(): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Returns a fresh, non-expired access token. Refreshes if necessary.
   * Throws when the user is not signed in or the refresh token is rejected.
   */
  getAccessToken(): Promise<string>;
}

export function createOAuthClient(config: OAuthConfig): OAuthClient {
  const tokensKey = `${config.providerKey}.tokens`;
  let inFlightRefresh: Promise<StoredTokens> | null = null;

  async function loadTokens(): Promise<StoredTokens | null> {
    const raw = await SecureStore.getItemAsync(tokensKey);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  }

  async function persistTokens(tokens: StoredTokens): Promise<void> {
    await SecureStore.setItemAsync(tokensKey, JSON.stringify(tokens));
  }

  async function clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(tokensKey);
  }

  async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
      });
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!response.ok) {
        await clearTokens();
        throw new Error(`OAuth refresh failed: ${response.status}`);
      }
      const json = (await response.json()) as {
        access_token: string;
        expires_in: number;
        refresh_token?: string;
      };
      const updated: StoredTokens = {
        accessToken: json.access_token,
        // Some providers omit a new refresh token — keep the existing one.
        refreshToken: json.refresh_token ?? refreshToken,
        expiresAt: Date.now() + json.expires_in * 1000,
      };
      await persistTokens(updated);
      return updated;
    })();

    try {
      return await inFlightRefresh;
    } finally {
      inFlightRefresh = null;
    }
  }

  return {
    async isSignedIn() {
      const t = await loadTokens();
      return t !== null;
    },

    async signIn() {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: config.redirectScheme,
        path: config.redirectPath ?? 'redirect',
      });
      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri,
        scopes: [...config.scopes],
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        // PKCE method is S256 by default in expo-auth-session.
      });

      const discovery: AuthSession.DiscoveryDocument = {
        authorizationEndpoint: config.authorizationEndpoint,
        tokenEndpoint: config.tokenEndpoint,
        ...(config.revocationEndpoint !== undefined
          ? { revocationEndpoint: config.revocationEndpoint }
          : {}),
      };

      const result = await request.promptAsync(discovery);
      if (result.type !== 'success') {
        throw new Error(`OAuth sign-in cancelled or failed (${result.type})`);
      }
      const code = result.params['code'];
      if (typeof code !== 'string') {
        throw new Error('OAuth sign-in did not return an authorization code');
      }

      // Exchange the code for tokens.
      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId: config.clientId,
          code,
          redirectUri,
          // codeVerifier is set by AuthRequest on success.
          extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
        },
        discovery,
      );

      if (!tokenResult.refreshToken) {
        throw new Error(
          `OAuth provider did not return a refresh token (provider=${config.providerKey})`,
        );
      }

      await persistTokens({
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt:
          Date.now() + (tokenResult.expiresIn ?? 3600) * 1000,
      });
    },

    async signOut() {
      const tokens = await loadTokens();
      await clearTokens();
      if (tokens && config.revocationEndpoint) {
        // Best-effort revocation. Network failures are intentionally swallowed.
        await fetch(config.revocationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokens.refreshToken }).toString(),
        }).catch(() => undefined);
      }
    },

    async getAccessToken() {
      const tokens = await loadTokens();
      if (!tokens) throw new Error('Not signed in');
      if (Date.now() < tokens.expiresAt - REFRESH_LEEWAY_MS) return tokens.accessToken;
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      return refreshed.accessToken;
    },
  };
}
