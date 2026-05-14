/**
 * Cloud-drive adapter interface — the single seam that lets `SyncEngine`
 * stay provider-agnostic.
 *
 * Each adapter (Google Drive `appDataFolder`, OneDrive `approot`, future
 * Dropbox/iCloud) implements this contract against its own auth flow and
 * transport. The engine never sees `expo-auth-session`, the Drive REST,
 * or the Microsoft Graph SDK — it only sees `Uint8Array` payloads and
 * opaque `etag` strings.
 *
 * Concurrency model: the adapter's `upload` accepts an optional `ifMatch`
 * etag that maps to:
 *   - Google Drive: `If-Match` header on the resumable-upload session URL
 *   - OneDrive:    `If-Match` header on `PUT /me/drive/special/approot`
 * If the remote etag has changed since the engine's last read, the upload
 * is rejected with `ConcurrencyError` and the engine retries the full
 * cycle (download → reapply → upload).
 *
 * Bandwidth model: the adapter's `download` accepts an optional
 * `ifNoneMatch` etag. When provided, the adapter MUST skip transferring
 * the file body if the remote etag still matches, and instead return
 * `{ kind: 'not-modified', etag }`. Implementations map this to:
 *   - Google Drive: `If-None-Match` header → 304 Not Modified.
 *   - OneDrive:     metadata-only fetch compared against `ifNoneMatch`.
 * This is the primary bandwidth saver — every idle auto-sync (cold
 * start, foreground return, net reconnect, …) skips the gzipped body.
 *
 * The interface is deliberately minimal — see ISP in
 * `.github/instructions/expenses-tracker-mobile.instructions.md`. Auth
 * specifics (PKCE, redirects, refresh tokens, scopes) live entirely
 * inside each adapter and never leak through this surface.
 */

/**
 * Outcome of a `download` call. Discriminated by `kind` so callers can
 * unambiguously distinguish "we got bytes" from "nothing changed" from
 * "the file does not exist yet".
 */
export type DownloadOutcome =
  | { readonly kind: 'modified'; readonly bytes: Uint8Array; readonly etag: string }
  | { readonly kind: 'not-modified'; readonly etag: string }
  | { readonly kind: 'absent' };

/** Result of a successful upload. */
export interface UploadResult {
  /** New etag returned by the server after the write. */
  readonly etag: string;
}

/**
 * Thrown by `upload` when the `ifMatch` etag did not match the remote
 * file's current etag. Engine catches this and retries with a fresh
 * download → apply → upload cycle.
 */
export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

/** Thrown when the user is signed out or the token cannot be refreshed. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface CloudDriveAdapter {
  /** Returns true when a valid (or refreshable) session is available. */
  isSignedIn(): Promise<boolean>;

  /**
   * Launch the provider's interactive sign-in flow (PKCE redirect).
   * Returns when the user has completed sign-in or rejects on cancel.
   */
  signIn(): Promise<void>;

  /** Revoke locally-stored tokens. Best-effort — never throws on network errors. */
  signOut(): Promise<void>;

  /**
   * Download the sync file.
   *
   *   - When `opts.ifNoneMatch` is set and the remote etag still
   *     matches, the adapter MUST return `{ kind: 'not-modified', etag }`
   *     WITHOUT transferring the file body. This is the bandwidth-saver
   *     path used by the engine when there are no local writes pending.
   *   - When the file does not exist (first sync from this account),
   *     returns `{ kind: 'absent' }`.
   *   - Otherwise returns `{ kind: 'modified', bytes, etag }`.
   *
   * Throws `AuthError` when not signed in.
   */
  download(opts?: { ifNoneMatch?: string }): Promise<DownloadOutcome>;

  /**
   * Upload the sync file. When `ifMatch` is set, the upload must be
   * rejected with `ConcurrencyError` if the remote etag has changed.
   *
   * Implementations MUST be idempotent on retry: a transport-level retry
   * after a partial network error must not produce two concurrent files.
   */
  upload(bytes: Uint8Array, ifMatch?: string): Promise<UploadResult>;
}
