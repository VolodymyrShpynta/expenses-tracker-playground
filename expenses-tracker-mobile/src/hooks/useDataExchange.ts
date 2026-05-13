/**
 * Mobile data exchange — export the local event log to a sync-format
 * file and import a previously-shared file back.
 *
 * The pure orchestration (build bytes, decode + apply) lives in
 * `src/sync/dataExchange.ts` and is unit-tested. This hook handles only
 * the React + Expo glue: file I/O, share / picker dialogs, and query
 * invalidation on success.
 */
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { useLocalStore } from '../db/databaseProvider';
import {
  applyImportedBytes,
  buildExportFile,
  type ImportSummary,
} from '../sync/dataExchange';
import { CATEGORIES_QUERY_KEY, EXPENSES_QUERY_KEY } from '../queryClient';

const EXPORT_FILENAME = 'expenses-tracker-export.json';
const TEXT_DECODER = new TextDecoder('utf-8');

export interface ExportResult {
  readonly uri: string;
  readonly eventCount: number;
  readonly categoryEventCount: number;
}

export type ImportResult = ImportSummary;

export function useExportData() {
  const store = useLocalStore();

  return useMutation<ExportResult>({
    mutationFn: async () => {
      const payload = await buildExportFile(store);
      const json = TEXT_DECODER.decode(payload.bytes);

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

      return {
        uri,
        eventCount: payload.eventCount,
        categoryEventCount: payload.categoryEventCount,
      };
    },
  });
}

export function useImportData() {
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

    const result = await applyImportedBytes(store, bytes);

    queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });

    return result;
  }, [store, queryClient]);

  return useMutation<ImportResult | null>({ mutationFn: run });
}
