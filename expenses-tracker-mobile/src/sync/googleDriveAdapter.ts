/**
 * `CloudDriveAdapter` backed by Google Drive's `appDataFolder` space.
 *
 * Why `appDataFolder`?
 *   - Files are app-private — invisible to the user's regular Drive UI
 *     and inaccessible to other apps. Mirrors OneDrive's `approot`.
 *   - Scope is `https://www.googleapis.com/auth/drive.appdata` only —
 *     narrowest possible permission, satisfies App Verification.
 *
 * Concurrency: Drive v3 does **not** support HTTP `ETag` / `If-Match`
 * on `files` (only on `revisions`), and `?alt=media` responses carry
 * no `ETag` header at all. The canonical concurrency token is the
 * file's **`version`** metadata field — a monotonically-increasing
 * integer (returned as a string) that bumps on every server-visible
 * change. We use that string as the opaque etag in the adapter
 * contract.
 *
 * Because Drive offers no atomic compare-and-swap on file content, the
 * "If-Match" guard in `upload` is implemented as a best-effort version
 * re-fetch immediately before the write: if the cached version differs
 * we raise `ConcurrencyError` and the engine retries. A TOCTOU race
 * window remains (another writer can land in between the version
 * check and our multipart PATCH), but the engine's event-level
 * last-write-wins by timestamp resolves any resulting divergence on
 * the next sync cycle — which is the project's stated conflict model
 * anyway (`AGENTS.md`).
 *
 * Setup steps the user must complete BEFORE this adapter works:
 *   1. Create a project at https://console.cloud.google.com.
 *   2. Enable the Drive API.
 *   3. Create one OAuth 2.0 Client ID per platform under
 *      "Credentials" → "Create credentials" → "OAuth client ID":
 *        - Application type: **Android** — package name from
 *          `android.package` in `app.json` plus the SHA-1 of the
 *          signing keystore (see README for the keytool command).
 *        - Application type: **iOS** — bundle id from
 *          `ios.bundleIdentifier`.
 *   4. Paste the resulting client ids into the per-platform
 *      `GOOGLE_OAUTH_CLIENT_ID_*` constants below.
 *
 * Redirect URI:
 *   Google's Android client type does NOT honour arbitrary custom
 *   schemes like `spendium://`. It accepts only the
 *   reverse-DNS of the package name **in single-slash form** —
 *   `com.vshpynta.spendium:/oauth2redirect`. The double-slash
 *   hierarchical form is rejected by Google's policy enforcer as
 *   `invalid_request`, even after the Custom URI scheme toggle is
 *   enabled. The matching intent-filter lives in
 *   `android/app/src/main/AndroidManifest.xml` — keep the two in
 *   sync. iOS follows the same convention with its bundle id, which
 *   happens to be the same string in this project.
 *
 *   On top of the package-name match, Google also requires the
 *   per-Android-client toggle **Advanced settings → Custom URI
 *   scheme → Enabled** in Cloud Console (May 2024 policy). New
 *   clients have it off by default; without it Google rejects the
 *   auth request with *"Custom URI scheme is not enabled for your
 *   Android client"*. See `README.md` for the click-through.
 *
 * NOT covered by Vitest — the OAuth flow needs a real browser.
 */
import { Platform } from 'react-native';
import { AuthError, ConcurrencyError } from './cloudDriveAdapter';
import type {
  CloudDriveAdapter,
  DownloadOutcome,
  UploadResult,
} from './cloudDriveAdapter';
import { createOAuthClient } from './oauthClient';

/** Sentinel value for the unconfigured client id. Used by `isGoogleDriveConfigured`. */
const GOOGLE_OAUTH_CLIENT_ID_UNCONFIGURED = 'TODO_REPLACE_WITH_GOOGLE_CLIENT_ID';

/**
 * TODO(setup): paste the **Android** OAuth Client ID from
 * Google Cloud Console → Clients → vs-expenses-tracker-android.
 * Looks like `<digits>-<hash>.apps.googleusercontent.com`.
 */
const GOOGLE_OAUTH_CLIENT_ID_ANDROID: string = '796330924848-ffqacbpspngfc8bcckejkld59eqst8vj.apps.googleusercontent.com';

/**
 * TODO(setup): paste the **iOS** OAuth Client ID from
 * Google Cloud Console → Clients → vs-expenses-tracker-ios.
 * Leave as-is until you build an iOS bundle.
 */
const GOOGLE_OAUTH_CLIENT_ID_IOS: string = '796330924848-viqbi8avvo73h8iatsnc2pu9dpm0mp75.apps.googleusercontent.com';

/**
 * Platform-specific client id resolved at module load. Google rejects
 * token requests whose `client_id` does not match the calling
 * platform's bundle + signing fingerprint, so the value MUST switch
 * based on `Platform.OS`.
 */
const GOOGLE_OAUTH_CLIENT_ID: string = Platform.select({
  android: GOOGLE_OAUTH_CLIENT_ID_ANDROID,
  ios: GOOGLE_OAUTH_CLIENT_ID_IOS,
  default: GOOGLE_OAUTH_CLIENT_ID_UNCONFIGURED,
});

/**
 * Whether the OAuth client id has been filled in for the **current
 * platform**. Single source of truth for "Google Drive sync is usable
 * on this build" — `syncProvider.tsx` consults it before constructing
 * the adapter. If you've configured Android but not iOS, this returns
 * `true` on Android and `false` on iOS, which is exactly the behaviour
 * we want.
 */
export function isGoogleDriveConfigured(): boolean {
  return GOOGLE_OAUTH_CLIENT_ID !== GOOGLE_OAUTH_CLIENT_ID_UNCONFIGURED;
}

const SYNC_FILE_NAME = 'sync.json.gz';
const APP_DATA_FOLDER = 'appDataFolder';

/**
 * Redirect scheme Google's Android / iOS OAuth clients accept. Must
 * match the package name (`android.package` in `app.json`) and bundle
 * identifier (`ios.bundleIdentifier`) — they are identical in this
 * project. Registered as an `<intent-filter>` in
 * `android/app/src/main/AndroidManifest.xml`.
 */
const GOOGLE_REDIRECT_SCHEME = 'com.vshpynta.spendium';
/** Path segment Google's docs use for the OAuth redirect URI. */
const GOOGLE_REDIRECT_PATH = 'oauth2redirect';

/**
 * Build the adapter. Pass a custom client id in tests to avoid touching globals.
 *
 * `extraAuthorizationParams` notes:
 *   - `access_type=offline` — Google only issues a refresh token when
 *     the authorization request carries this flag. Without it, the
 *     token endpoint returns just an access token and our generic
 *     `oauthClient.signIn()` throws "OAuth provider did not return a
 *     refresh token".
 *   - `prompt=consent` — forces Google to re-show the consent screen
 *     even for users who have signed in before. This guarantees a
 *     refresh token on every sign-in, including re-installs after
 *     `signOut()` has wiped local storage.
 *
 * Microsoft does NOT need this: its `offline_access` is requested as
 * a scope in `oneDriveAdapter.ts`, which is the Entra equivalent.
 */
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
    redirectScheme: GOOGLE_REDIRECT_SCHEME,
    redirectPath: GOOGLE_REDIRECT_PATH,
    // Force the single-slash form. Google rejects the double-slash
    // form `com.vshpynta.spendium://oauth2redirect` with
    // `invalid_request` even with the Custom URI scheme toggle on.
    nativeRedirectUri: `${GOOGLE_REDIRECT_SCHEME}:/${GOOGLE_REDIRECT_PATH}`,
    extraAuthorizationParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  /**
   * Find the sync file's id + current version. Returns `null` when no
   * file exists yet.
   *
   * Drive REST list query restricted to the `appDataFolder` space and
   * filtered by exact name match — the appDataFolder typically has at
   * most one file but we still pick the most-recently-modified one for
   * resilience. `fields=files(id,version)` keeps the response payload
   * minimal.
   */
  async function findFileMetadata(
    token: string,
  ): Promise<{ id: string; version: string } | null> {
    const url =
      `https://www.googleapis.com/drive/v3/files` +
      `?spaces=${APP_DATA_FOLDER}` +
      `&q=name%3D'${SYNC_FILE_NAME}'` +
      `&orderBy=modifiedTime desc` +
      `&fields=files(id,version)`;
    const response = await authFetch(url, { method: 'GET' }, token);
    if (response.status === 401) throw new AuthError('Drive auth rejected');
    if (!response.ok) {
      throw new Error(`Drive list failed: ${response.status}`);
    }
    const json = (await response.json()) as {
      files?: ReadonlyArray<{ id: string; version: string }>;
    };
    if (!json.files || json.files.length === 0) return null;
    const head = json.files[0]!;
    if (typeof head.version !== 'string' || head.version.length === 0) {
      throw new Error('Drive did not return a version — cannot guarantee concurrency');
    }
    return { id: head.id, version: head.version };
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

    async download(opts?: { ifNoneMatch?: string }): Promise<DownloadOutcome> {
      let token: string;
      try {
        token = await oauth.getAccessToken();
      } catch (e) {
        throw new AuthError(e instanceof Error ? e.message : 'auth error');
      }

      const meta = await findFileMetadata(token);
      if (meta === null) return { kind: 'absent' };

      // Drive v3 has no working HTTP-level conditional GET on file
      // content (`If-None-Match` is silently ignored on `?alt=media`).
      // Compare `version` ourselves and skip the body fetch if it
      // matches — exactly what `oneDriveAdapter` does.
      if (opts?.ifNoneMatch !== undefined && opts.ifNoneMatch === meta.version) {
        return { kind: 'not-modified', etag: meta.version };
      }

      const response = await authFetch(
        `https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`,
        { method: 'GET' },
        token,
      );
      if (response.status === 401) throw new AuthError('Drive auth rejected');
      if (!response.ok) throw new Error(`Drive download failed: ${response.status}`);

      const buffer = await response.arrayBuffer();
      return { kind: 'modified', bytes: new Uint8Array(buffer), etag: meta.version };
    },

    async upload(bytes: Uint8Array, ifMatch?: string): Promise<UploadResult> {
      let token: string;
      try {
        token = await oauth.getAccessToken();
      } catch (e) {
        throw new AuthError(e instanceof Error ? e.message : 'auth error');
      }

      const existing = await findFileMetadata(token);

      // Best-effort optimistic-concurrency check. Drive v3 has no
      // server-side `If-Match` on files, so we re-read `version` here
      // and reject the write if it has moved. A racing writer can
      // still slip in between this check and the multipart PATCH
      // below; the engine's event-level last-write-wins by timestamp
      // resolves the resulting divergence on the next cycle.
      if (
        ifMatch !== undefined &&
        existing !== null &&
        existing.version !== ifMatch
      ) {
        throw new ConcurrencyError(
          `Drive version changed (expected ${ifMatch}, got ${existing.version})`,
        );
      }

      // Multipart upload: metadata + content.
      const boundary = 'boundary-' + Math.random().toString(36).slice(2);
      const metadata =
        existing === null
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

      // `fields=version` tells Drive to include the new version in the
      // JSON response body, sparing us a second metadata round trip.
      const url =
        existing === null
          ? 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=version'
          : `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=version`;

      const headers = new Headers({
        'Content-Type': `multipart/related; boundary=${boundary}`,
      });

      const response = await authFetch(
        url,
        {
          method: existing === null ? 'POST' : 'PATCH',
          headers,
          body: body as unknown as BodyInit,
        },
        token,
      );

      if (response.status === 401) {
        throw new AuthError('Drive auth rejected');
      }
      if (!response.ok) {
        throw new Error(`Drive upload failed: ${response.status}`);
      }

      const json = (await response.json()) as { version?: string };
      if (typeof json.version !== 'string' || json.version.length === 0) {
        throw new Error('Drive did not return a new version after upload');
      }
      return { etag: json.version };
    },
  };
}
