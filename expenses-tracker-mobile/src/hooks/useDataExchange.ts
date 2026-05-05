/**
 * Mobile data exchange — export the local event log to a sync-format
 * file and import a previously-shared file back.
 *
 * Mobile is local-first; there is no server-side `/api/expenses/export`
 * endpoint to call. Instead we:
 *   - Read every event for the active user from the local store.
 *   - Encode to the same `EventSyncFile` JSON shape the cloud-drive sync
 *     uses (uncompressed for human readability when shared via mail/etc.).
 *   - Write to the cache directory and hand the URI to `expo-sharing`.
 *
 * Import is the reverse: pick a file, decode (auto-detecting gzip via
 * magic bytes), and feed the events through `applyRemoteEvents` — same
 * idempotency / LWW path the sync engine uses, so re-importing the same
 * file is a no-op and merging two devices' files works correctly.
 */
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { useAppServices } from '../context/appServicesProvider';
import { useLocalStore } from '../db/databaseProvider';
import { decodeSyncFile, encodeSyncFile, sortEventsDeterministically } from '../sync/codec';
import { applyRemoteEvents } from '../sync/remoteEventApplier';
import { jsonToPayload } from '../domain/mapping';
import type { EventEntry, EventSyncFile } from '../domain/types';
import { CATEGORIES_QUERY_KEY, EXPENSES_QUERY_KEY } from '../queryClient';

const EXPORT_FILENAME = 'expenses-tracker-export.json';
// Magic bytes for gzip — first two bytes are 0x1f 0x8b regardless of payload.
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
const TEXT_DECODER = new TextDecoder('utf-8');

export interface ExportResult {
  readonly uri: string;
  readonly eventCount: number;
}

export interface ImportResult {
  readonly applied: number;
  readonly skipped: number;
  readonly errors: number;
}

export function useExportData() {
  const { userId } = useAppServices();
  const store = useLocalStore();

  return useMutation<ExportResult>({
    mutationFn: async () => {
      const events = await store.findAllEvents(userId);

      const entries: EventEntry[] = events.map((e) => ({
        eventId: e.eventId,
        timestamp: e.timestamp,
        eventType: e.eventType,
        expenseId: e.expenseId,
        payload: jsonToPayload(e.payload),
        userId: e.userId,
      }));

      const syncFile: EventSyncFile = {
        events: sortEventsDeterministically(entries),
      };
      // Uncompressed: easier for the user to inspect or paste into a
      // backup. The codec still handles gzip on import via auto-detect.
      const bytes = encodeSyncFile(syncFile, false);
      const json = TEXT_DECODER.decode(bytes);

      const file = new File(Paths.cache, EXPORT_FILENAME);
      // `write` overwrites existing content, so a stale export is replaced.
      file.write(json);
      const uri = file.uri;

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: 'Expenses tracker export',
          UTI: 'public.json',
        });
      }

      return { uri, eventCount: entries.length };
    },
  });
}

export function useImportData() {
  const { userId } = useAppServices();
  const store = useLocalStore();
  const queryClient = useQueryClient();

  const run = useCallback(async (): Promise<ImportResult | null> => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/gzip', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return null;
    const asset = picked.assets[0];
    if (!asset) return null;

    // Read raw bytes from the picked file. The new expo-file-system API
    // exposes `bytes()` directly, no encoding option needed.
    const file = new File(asset.uri);
    const bytes = await file.bytes();
    const compressed =
      bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;

    const parsed: EventSyncFile = decodeSyncFile(bytes, compressed);

    // Stamp the active userId on entries that were exported from a
    // different device's user scope. Mirrors what the backend's
    // `RemoteEventProcessor` does.
    const entries: EventEntry[] = parsed.events.map((entry) => ({
      ...entry,
      userId: entry.userId ?? userId,
      payload: { ...entry.payload, userId: entry.payload.userId ?? userId },
    }));

    const result = await applyRemoteEvents(store, entries);

    queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });

    return result;
  }, [store, queryClient, userId]);

  return useMutation<ImportResult | null>({ mutationFn: run });
}
