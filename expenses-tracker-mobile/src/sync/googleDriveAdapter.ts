/**
 * `CloudDriveAdapter` backed by Google Drive's `appDataFolder` space.
 *
 * Why `appDataFolder`?
 *   - Files are app-private — invisible to the user's regular Drive UI
 *     and inaccessible to other apps. Mirrors OneDrive's `approot`.
 *   - Scope is `https://www.googleapis.com/auth/drive.appdata` only —
 *     narrowest possible permission, satisfies App Verification.
 *
 * Concurrency: Drive REST returns an `ETag` HTTP header on
 * `GET /files/{id}`. We pass it through `If-Match` on `PATCH` /
 * multipart-update; a `412 Precondition Failed` becomes
 * `ConcurrencyError`, which the engine retries.
 *
 * Setup steps the user must complete BEFORE this adapter works:
 *   1. Create a project at https://console.cloud.google.com.
 *   2. Enable the Drive API.
 *   3. Create an OAuth client (Application type: iOS + Android, or
 *      "TVs and Limited Input devices" for Expo's auth proxy in dev).
 *   4. Configure the bundle id from `app.json` and the redirect scheme
 *      `expensestracker:/redirect`.
 *   5. Replace `GOOGLE_OAUTH_CLIENT_ID` below.
 *
 * NOT covered by Vitest — the OAuth flow needs a real browser.
 */
import { AuthError, ConcurrencyError } from './cloudDriveAdapter.ts';
import type {
  CloudDriveAdapter,
  DownloadResult,
  UploadResult,
} from './cloudDriveAdapter.ts';
import { createOAuthClient } from './oauthClient.ts';

/** TODO(setup): replace with the OAuth Client ID from Google Cloud Console. */
const GOOGLE_OAUTH_CLIENT_ID = 'TODO_REPLACE_WITH_GOOGLE_CLIENT_ID';

const SYNC_FILE_NAME = 'sync.json.gz';
const APP_DATA_FOLDER = 'appDataFolder';

/** Build the adapter. Pass a custom client id in tests to avoid touching globals. */
export function createGoogleDriveAdapter(
  options: { clientId?: string } = {},
): CloudDriveAdapter {
  const oauth = createOAuthClient({
    providerKey: 'gdrive',
    clientId: options.clientId ?? GOOGLE_OAUTH_CLIENT_ID,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    redirectScheme: 'expensestracker',
  });

  /**
   * Find the sync file's id. Returns `null` when no file exists yet.
   *
   * Drive REST list query restricted to the `appDataFolder` space and
   * filtered by exact name match — the appDataFolder typically has at
   * most one file but we still pick the most-recently-modified one for
   * resilience.
   */
  async function findFileId(token: string): Promise<string | null> {
    const url =
      `https://www.googleapis.com/drive/v3/files` +
      `?spaces=${APP_DATA_FOLDER}` +
      `&q=name%3D'${SYNC_FILE_NAME}'` +
      `&orderBy=modifiedTime desc` +
      `&fields=files(id,modifiedTime)`;
    const response = await authFetch(url, { method: 'GET' }, token);
    if (!response.ok) {
      throw new Error(`Drive list failed: ${response.status}`);
    }
    const json = (await response.json()) as { files?: ReadonlyArray<{ id: string }> };
    return json.files && json.files.length > 0 ? (json.files[0]!.id) : null;
  }

  async function authFetch(
    input: string,
    init: RequestInit,
    token: string,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
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

      const fileId = await findFileId(token);
      if (fileId === null) return null;

      const response = await authFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { method: 'GET' },
        token,
      );
      if (response.status === 401) throw new AuthError('Drive auth rejected');
      if (!response.ok) throw new Error(`Drive download failed: ${response.status}`);

      const etag = response.headers.get('ETag');
      if (etag === null) {
        throw new Error('Drive did not return an ETag — cannot guarantee concurrency');
      }
      const buffer = await response.arrayBuffer();
      return { bytes: new Uint8Array(buffer), etag };
    },

    async upload(bytes: Uint8Array, ifMatch?: string): Promise<UploadResult> {
      let token: string;
      try {
        token = await oauth.getAccessToken();
      } catch (e) {
        throw new AuthError(e instanceof Error ? e.message : 'auth error');
      }

      const existingId = await findFileId(token);

      // Multipart upload: metadata + content.
      const boundary = 'boundary-' + Math.random().toString(36).slice(2);
      const metadata =
        existingId === null
          ? JSON.stringify({ name: SYNC_FILE_NAME, parents: [APP_DATA_FOLDER] })
          : JSON.stringify({ name: SYNC_FILE_NAME });

      // Build a binary multipart body: header + metadata part + body part + closer.
      const enc = new TextEncoder();
      const head = enc.encode(
        `--${boundary}\r\n` +
          `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
          metadata +
          `\r\n--${boundary}\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
      );
      const tail = enc.encode(`\r\n--${boundary}--`);
      const body = new Uint8Array(head.length + bytes.length + tail.length);
      body.set(head, 0);
      body.set(bytes, head.length);
      body.set(tail, head.length + bytes.length);

      const url =
        existingId === null
          ? 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
          : `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`;

      const headers = new Headers({
        'Content-Type': `multipart/related; boundary=${boundary}`,
      });
      if (ifMatch !== undefined && existingId !== null) {
        headers.set('If-Match', ifMatch);
      }

      const response = await authFetch(
        url,
        {
          method: existingId === null ? 'POST' : 'PATCH',
          headers,
          body: body as unknown as BodyInit,
        },
        token,
      );

      if (response.status === 412) {
        throw new ConcurrencyError('Drive returned 412 Precondition Failed');
      }
      if (response.status === 401) {
        throw new AuthError('Drive auth rejected');
      }
      if (!response.ok) {
        throw new Error(`Drive upload failed: ${response.status}`);
      }

      const newEtag = response.headers.get('ETag');
      if (newEtag === null) {
        throw new Error('Drive did not return a new ETag after upload');
      }
      return { etag: newEtag };
    },
  };
}
