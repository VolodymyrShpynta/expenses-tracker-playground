/**
 * Mobile data exchange — export the local projections to a portable
 * JSON snapshot and import a previously-exported file back.
 *
 * Wire format matches the web frontend's export exactly so a file
 * round-trips between platforms (see `src/sync/dataExchange.ts`).
 *
 * The pure orchestration (build bytes, parse + apply) lives in
 * `src/sync/dataExchange.ts` and is unit-tested. This hook handles only
 * the React + Expo glue: file I/O, share / picker dialogs, and query
 * invalidation on success.
 *
 * Export destination is platform-specific:
 *   - **Android** — opens the Storage Access Framework folder picker so
 *     the user can save the file directly into any local folder (e.g.
 *     `Documents`, `Download`, or any SAF-aware app). Cancelling the
 *     picker resolves to `null`.
 *   - **iOS / others** — writes to the cache directory and opens the
 *     OS share sheet, where "Save to Files" provides equivalent folder
 *     selection.
 */
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { useLocalStore } from '../db/databaseProvider';
import { useAppServices } from '../context/appServicesProvider';
import {
  applyImportedBytes,
  buildExportFile,
  type ImportSummary,
} from '../sync/dataExchange';
import { CATEGORIES_QUERY_KEY, EXPENSES_QUERY_KEY } from '../queryClient';
import { systemTime } from '../utils/time';

const EXPORT_FILENAME = 'expenses-tracker-export.json';
const EXPORT_MIME_TYPE = 'application/json';
const TEXT_DECODER = new TextDecoder('utf-8');

export interface ExportResult {
  readonly uri: string;
  readonly categoryCount: number;
  readonly expenseCount: number;
}

export type ImportResult = ImportSummary;

export function useExportData() {
  const store = useLocalStore();

  return useMutation<ExportResult | null>({
    mutationFn: async () => {
      const payload = await buildExportFile({ store, time: systemTime });
      const json = TEXT_DECODER.decode(payload.bytes);

      const uri =
        Platform.OS === 'android'
          ? await writeViaStorageAccessFramework(json)
          : await writeViaShareSheet(json);

      // `null` propagates the user's cancel — surfaced as a no-op by the UI.
      if (uri === null) return null;

      return {
        uri,
        categoryCount: payload.categoryCount,
        expenseCount: payload.expenseCount,
      };
    },
  });
}

/**
 * Android — Storage Access Framework folder picker. The user chooses a
 * destination folder; the export is written as a new file there. Returns
 * `null` when the user dismisses the picker without granting access.
 */
async function writeViaStorageAccessFramework(json: string): Promise<string | null> {
  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;

  // SAF appends the `.json` extension based on the MIME type, so we strip
  // it from the suggested filename to avoid `expenses-tracker-export.json.json`.
  const baseName = EXPORT_FILENAME.replace(/\.json$/i, '');
  const fileUri = await StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    baseName,
    EXPORT_MIME_TYPE,
  );
  await StorageAccessFramework.writeAsStringAsync(fileUri, json);
  return fileUri;
}

/**
 * iOS / others — write the export to the cache directory and open the
 * OS share sheet so the user can route it through "Save to Files" or
 * any other share target. Cache-directory writes are overwritten on
 * every export, so stale copies cannot accumulate.
 */
async function writeViaShareSheet(json: string): Promise<string> {
  const file = new File(Paths.cache, EXPORT_FILENAME);
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: EXPORT_MIME_TYPE,
      dialogTitle: 'Expenses tracker export',
      UTI: 'public.json',
    });
  }
  return file.uri;
}

export function useImportData() {
  const { categories: categoryService, expenseCommands } = useAppServices();
  const queryClient = useQueryClient();

  const run = useCallback(async (): Promise<ImportResult | null> => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/octet-stream', '*/*'],
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

    const result = await applyImportedBytes(bytes, {
      categoryService,
      expenseCommands,
    });

    queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });

    return result;
  }, [categoryService, expenseCommands, queryClient]);

  return useMutation<ImportResult | null>({ mutationFn: run });
}
