/**
 * Google Drive adapter tests against an in-memory fake of the Drive v3
 * REST API. The fake reproduces the two Drive behaviours that defeated
 * change detection when the adapter compared `version` from a name
 * search: `version` moving after the upload reply with no new content,
 * and search results that are behind the latest write.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { select: (options: Record<string, unknown>) => options.android },
}));
vi.mock('./oauthClient', () => ({
  createOAuthClient: () => ({
    isSignedIn: async () => true,
    signIn: async () => undefined,
    signOut: async () => undefined,
    getAccessToken: async () => 'test-token',
  }),
}));

import { ConcurrencyError } from './cloudDriveAdapter';
import { createGoogleDriveAdapter } from './googleDriveAdapter';
import { createSyncEngine } from './syncEngine';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';

interface StoredFile {
  content: Buffer;
  version: number;
}

class FakeDrive {
  readonly files = new Map<string, StoredFile>();
  /** Simulates server-side processing that bumps `version` after the upload reply. */
  bumpVersionAfterUpload = false;
  /** When set, the name search keeps returning this outdated result. */
  frozenSearch: ReadonlyArray<Record<string, string>> | null = null;
  omitChecksum = false;
  searchCount = 0;
  contentDownloads = 0;
  private nextId = 1;

  readonly fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const fileId = /\/files\/([^/]+)$/.exec(url.pathname)?.[1];
    if (url.pathname === '/drive/v3/files' && method === 'GET') return this.search();
    if (url.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      return url.searchParams.get('alt') === 'media' ? this.content(fileId!) : this.metadata(fileId!);
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      return this.store(`file-${this.nextId++}`, init);
    }
    if (url.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      return this.files.has(fileId!) ? this.store(fileId!, init) : json(404, {});
    }
    throw new Error(`Unexpected Drive call: ${method} ${url.pathname}`);
  };

  /** Another device replaces the content. */
  writeExternally(id: string, text: string): void {
    const file = this.files.get(id);
    this.files.set(id, { content: Buffer.from(text), version: (file?.version ?? 0) + 1 });
  }

  fieldsOf(id: string): Record<string, string> {
    const file = this.files.get(id)!;
    return {
      id,
      version: String(file.version),
      ...(this.omitChecksum ? {} : { md5Checksum: createHash('md5').update(file.content).digest('hex') }),
    };
  }

  private search(): Response {
    this.searchCount += 1;
    const files = this.frozenSearch ?? [...this.files.keys()].reverse().map((id) => this.fieldsOf(id));
    return json(200, { files });
  }

  private metadata(id: string): Response {
    return this.files.has(id) ? json(200, this.fieldsOf(id)) : json(404, {});
  }

  private content(id: string): Response {
    this.contentDownloads += 1;
    const file = this.files.get(id);
    return file ? new Response(new Uint8Array(file.content)) : json(404, {});
  }

  private store(id: string, init: RequestInit): Response {
    const boundary = /boundary=(.+)$/.exec(new Headers(init.headers).get('Content-Type') ?? '')![1]!;
    const body = Buffer.from(init.body as Uint8Array);
    const marker = Buffer.from('Content-Type: application/octet-stream\r\n\r\n');
    const start = body.indexOf(marker) + marker.length;
    const end = body.lastIndexOf(Buffer.from(`\r\n--${boundary}--`));
    const previous = this.files.get(id);
    this.files.set(id, { content: body.subarray(start, end), version: (previous?.version ?? 0) + 1 });
    const reply = json(200, this.fieldsOf(id));
    if (this.bumpVersionAfterUpload) this.files.get(id)!.version += 1;
    return reply;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array): string => new TextDecoder().decode(data);

describe('createGoogleDriveAdapter', () => {
  let drive: FakeDrive;

  beforeEach(() => {
    drive = new FakeDrive();
    vi.stubGlobal('fetch', drive.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns absent when no sync file exists', async () => {
    // When
    const outcome = await createGoogleDriveAdapter().download();

    // Then
    expect(outcome).toEqual({ kind: 'absent' });
  });

  it('skips the content download after an upload even when Drive bumps version', async () => {
    // Given
    drive.bumpVersionAfterUpload = true;
    const adapter = createGoogleDriveAdapter();
    const { etag } = await adapter.upload(bytes('state-1'));

    // When
    const outcome = await adapter.download({ ifNoneMatch: etag });

    // Then
    expect(outcome).toEqual({ kind: 'not-modified', etag });
    expect(drive.contentDownloads).toBe(0);
  });

  it('reads metadata by file id so an outdated search result cannot report a stale validator', async () => {
    // Given: the search keeps returning the state before the second upload
    const adapter = createGoogleDriveAdapter();
    const first = await adapter.upload(bytes('state-1'));
    drive.frozenSearch = [drive.fieldsOf('file-1')];
    const second = await adapter.upload(bytes('state-2'), first.etag);

    // When
    const outcome = await adapter.download({ ifNoneMatch: second.etag });

    // Then
    expect(outcome).toEqual({ kind: 'not-modified', etag: second.etag });
    expect(drive.searchCount).toBe(1);
  });

  it('downloads new content with its checksum when another device changed the file', async () => {
    // Given
    const adapter = createGoogleDriveAdapter();
    const { etag } = await adapter.upload(bytes('state-1'));
    drive.writeExternally('file-1', 'state-2');

    // When
    const outcome = await adapter.download({ ifNoneMatch: etag });

    // Then
    expect(outcome.kind).toBe('modified');
    if (outcome.kind !== 'modified') return;
    expect(text(outcome.bytes)).toBe('state-2');
    expect(outcome.etag).toBe(drive.fieldsOf('file-1').md5Checksum);
    expect(outcome.etag).not.toBe(etag);
  });

  it('rejects an upload when the content changed since the caller last saw it', async () => {
    // Given
    const adapter = createGoogleDriveAdapter();
    const { etag } = await adapter.upload(bytes('state-1'));
    drive.writeExternally('file-1', 'state-2');

    // When / Then
    await expect(adapter.upload(bytes('state-3'), etag)).rejects.toBeInstanceOf(ConcurrencyError);
    expect(text(new Uint8Array(drive.files.get('file-1')!.content))).toBe('state-2');
  });

  it('accepts an upload when only the version moved since the caller last saw it', async () => {
    // Given
    drive.bumpVersionAfterUpload = true;
    const adapter = createGoogleDriveAdapter();
    const { etag } = await adapter.upload(bytes('state-1'));

    // When
    await adapter.upload(bytes('state-2'), etag);

    // Then
    expect(text(new Uint8Array(drive.files.get('file-1')!.content))).toBe('state-2');
  });

  it('falls back to the name search when the remembered file is gone', async () => {
    // Given: the file is replaced by a new one (for example after app data was cleared)
    const adapter = createGoogleDriveAdapter();
    const { etag } = await adapter.upload(bytes('state-1'));
    drive.files.delete('file-1');
    drive.writeExternally('file-9', 'state-9');

    // When
    const replaced = await adapter.download({ ifNoneMatch: etag });
    const repeated = await adapter.download({ ifNoneMatch: replaced.kind === 'modified' ? replaced.etag : '' });

    // Then
    expect(replaced.kind).toBe('modified');
    expect(repeated.kind).toBe('not-modified');
    expect(drive.searchCount).toBe(2);
  });

  it('falls back to the version when Drive omits the checksum', async () => {
    // Given
    drive.omitChecksum = true;
    const adapter = createGoogleDriveAdapter();

    // When
    const { etag } = await adapter.upload(bytes('state-1'));

    // Then
    expect(etag).toBe('version:1');
    expect(await adapter.download({ ifNoneMatch: etag })).toEqual({ kind: 'not-modified', etag });
  });

  it('lets an idle sync after an upload skip the download when Drive bumps version', async () => {
    // Given
    drive.bumpVersionAfterUpload = true;
    const store = new InMemoryLocalStore();
    const engine = createSyncEngine({ store, adapter: createGoogleDriveAdapter() });
    const payload = { id: 'x1', amount: 100, currency: 'EUR', updatedAt: Date.now(), deleted: false };
    await store.appendEvent({
      eventId: 'e1', timestamp: payload.updatedAt, eventType: 'CREATED', expenseId: 'x1',
      payload: JSON.stringify(payload), committed: false,
    });
    await store.projectFromEvent(payload);

    // When
    const pushed = await engine.performFullSync();
    const idle = await engine.performFullSync();

    // Then
    expect(pushed.uploadedLocal).toBe(1);
    expect(idle.downloadedRemote).toBe(false);
    expect(drive.contentDownloads).toBe(0);
  });
});
