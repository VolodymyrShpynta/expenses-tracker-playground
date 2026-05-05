/**
 * `CloudDriveAdapter` backed by OneDrive's app-private `approot`
 * (`/me/drive/special/approot`).
 *
 * Why `approot`?
 *   - App-private folder visible only to this app — equivalent to
 *     Google Drive's `appDataFolder`.
 *   - Single scope: `Files.ReadWrite.AppFolder` (plus `offline_access`
 *     for refresh tokens). Smallest blast radius.
 *
 * Concurrency: Microsoft Graph returns an `eTag` field on the
 * driveItem resource; we forward it as `If-Match` on `PUT` requests.
 * `412 Precondition Failed` becomes `ConcurrencyError`.
 *
 * Setup steps the user must complete BEFORE this adapter works:
 *   1. Register an app at https://entra.microsoft.com → App registrations.
 *   2. Add a "Mobile and desktop applications" platform with redirect
 *      URI `expensestracker://redirect`.
 *   3. Under API permissions, add Microsoft Graph delegated permissions
 *      `Files.ReadWrite.AppFolder` and `offline_access`.
 *   4. Replace `MICROSOFT_OAUTH_CLIENT_ID` below.
 *
 * NOT covered by Vitest — needs a real browser for the OAuth flow.
 */
import { AuthError, ConcurrencyError } from './cloudDriveAdapter';
import type {
  CloudDriveAdapter,
  DownloadResult,
  UploadResult,
} from './cloudDriveAdapter';
import { createOAuthClient } from './oauthClient';

/** TODO(setup): replace with the OAuth Client ID from Microsoft Entra. */
const MICROSOFT_OAUTH_CLIENT_ID = 'TODO_REPLACE_WITH_MICROSOFT_CLIENT_ID';

const SYNC_FILE_NAME = 'sync.json.gz';

/** Build the adapter. Pass `clientId` in tests to avoid touching globals. */
export function createOneDriveAdapter(
  options: { clientId?: string } = {},
): CloudDriveAdapter {
  const oauth = createOAuthClient({
    providerKey: 'onedrive',
    clientId: options.clientId ?? MICROSOFT_OAUTH_CLIENT_ID,
    // Tenant `consumers` for personal accounts; switch to `common` if you
    // want to support work/school accounts too.
    authorizationEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    scopes: ['Files.ReadWrite.AppFolder', 'offline_access'],
    redirectScheme: 'expensestracker',
  });

  async function authFetch(
    input: string,
    init: RequestInit,
    token: string,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }

  /**
   * Fetch the driveItem metadata. Returns `null` when the file does not
   * yet exist (Graph returns 404 with `itemNotFound`).
   */
  async function getMetadata(
    token: string,
  ): Promise<{ id: string; etag: string } | null> {
    const response = await authFetch(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILE_NAME}`,
      { method: 'GET' },
      token,
    );
    if (response.status === 404) return null;
    if (response.status === 401) throw new AuthError('Graph auth rejected');
    if (!response.ok) {
      throw new Error(`OneDrive metadata fetch failed: ${response.status}`);
    }
    const json = (await response.json()) as { id: string; eTag?: string };
    if (!json.eTag) {
      throw new Error('OneDrive did not return an eTag — cannot guarantee concurrency');
    }
    return { id: json.id, etag: json.eTag };
  }

  return {
    isSignedIn: () => oauth.isSignedIn(),
    signIn: () => oauth.signIn(),
    signOut: () => oauth.signOut(),

    async download(): Promise<DownloadResult | null> {
      let token: string;
      try {
        token = await oauth.getAccessToken();
      } catch (e) {
        throw new AuthError(e instanceof Error ? e.message : 'auth error');
      }

      const meta = await getMetadata(token);
      if (meta === null) return null;

      const response = await authFetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${meta.id}/content`,
        { method: 'GET' },
        token,
      );
      if (response.status === 401) throw new AuthError('Graph auth rejected');
      if (!response.ok) {
        throw new Error(`OneDrive download failed: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return { bytes: new Uint8Array(buffer), etag: meta.etag };
    },

    async upload(bytes: Uint8Array, ifMatch?: string): Promise<UploadResult> {
      let token: string;
      try {
        token = await oauth.getAccessToken();
      } catch (e) {
        throw new AuthError(e instanceof Error ? e.message : 'auth error');
      }

      const headers = new Headers({ 'Content-Type': 'application/octet-stream' });
      if (ifMatch !== undefined) headers.set('If-Match', ifMatch);

      // Simple PUT works for files <4MB; sync.json.gz is far smaller.
      // Switch to upload-session for larger payloads if it ever grows.
      const response = await authFetch(
        `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILE_NAME}:/content`,
        { method: 'PUT', headers, body: bytes as unknown as BodyInit },
        token,
      );

      if (response.status === 412) {
        throw new ConcurrencyError('OneDrive returned 412 Precondition Failed');
      }
      if (response.status === 401) throw new AuthError('Graph auth rejected');
      if (!response.ok) {
        throw new Error(`OneDrive upload failed: ${response.status}`);
      }
      const json = (await response.json()) as { eTag?: string };
      if (!json.eTag) {
        throw new Error('OneDrive did not return a new eTag after upload');
      }
      return { etag: json.eTag };
    },
  };
}
