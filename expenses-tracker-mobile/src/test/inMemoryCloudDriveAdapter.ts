/**
 * In-memory `CloudDriveAdapter` for tests. Models a single shared remote
 * file with optimistic-concurrency semantics:
 *   - Each `upload` increments the etag (`etag-1`, `etag-2`, …).
 *   - When `ifMatch` is set and disagrees with the current etag, the
 *     adapter throws `ConcurrencyError` (mirrors Drive REST `412
 *     Precondition Failed` and Graph's `If-Match` semantics).
 *
 * The adapter is intentionally simplified — no auth flow, no network — so
 * `SyncEngine` tests can focus on orchestration logic.
 */
import {
  AuthError,
  ConcurrencyError,
  type CloudDriveAdapter,
  type DownloadResult,
  type UploadResult,
} from '../sync/cloudDriveAdapter';

export class InMemoryCloudDriveAdapter implements CloudDriveAdapter {
  private signedIn = true;
  private bytes: Uint8Array | null = null;
  private etag: string | null = null;
  private etagCounter = 0;
  /** Number of uploads performed — useful for assertions. */
  public uploadCount = 0;
  /** Number of downloads performed — useful for assertions. */
  public downloadCount = 0;

  async isSignedIn(): Promise<boolean> {
    return this.signedIn;
  }

  async signIn(): Promise<void> {
    this.signedIn = true;
  }

  async signOut(): Promise<void> {
    this.signedIn = false;
  }

  async download(): Promise<DownloadResult | null> {
    if (!this.signedIn) throw new AuthError('not signed in');
    this.downloadCount += 1;
    if (this.bytes === null || this.etag === null) return null;
    return { bytes: this.bytes, etag: this.etag };
  }

  async upload(bytes: Uint8Array, ifMatch?: string): Promise<UploadResult> {
    if (!this.signedIn) throw new AuthError('not signed in');
    if (ifMatch !== undefined && this.etag !== null && ifMatch !== this.etag) {
      throw new ConcurrencyError(
        `etag mismatch: client=${ifMatch} server=${this.etag}`,
      );
    }
    this.uploadCount += 1;
    this.etagCounter += 1;
    this.etag = `etag-${this.etagCounter}`;
    this.bytes = bytes;
    return { etag: this.etag };
  }

  /** Test helper: simulate another device writing the file directly. */
  setRemoteBytes(bytes: Uint8Array): string {
    this.etagCounter += 1;
    this.etag = `etag-${this.etagCounter}`;
    this.bytes = bytes;
    return this.etag;
  }

  /** Test helper: read the current bytes without affecting download count. */
  peekBytes(): Uint8Array | null {
    return this.bytes;
  }

  /** Test helper: read the current etag. */
  peekEtag(): string | null {
    return this.etag;
  }
}
