/**
 * Mobile data exchange — export the local projections to a portable
 * JSON snapshot or spreadsheet CSV and import a JSON snapshot back.
 *
 * JSON matches the web frontend's export for cross-platform transfer.
 * CSV is a single expenses file, not the web backend's CSV-in-ZIP format.
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
  type ExportFormat,
  type ImportSummary,
} from '../sync/dataExchange';
import { useCategoryLookup } from './useCategoryLookup';
import { CATEGORIES_QUERY_KEY, EXPENSES_QUERY_KEY } from '../queryClient';
import { systemTime } from '../utils/time';

const EXPORT_FILES = {
  json: {
    filename: 'spendium-export.json',
    mimeType: 'application/json',
    uti: 'public.json',
  },
  csv: {
    filename: 'spendium-export.csv',
    mimeType: 'text/csv',
    uti: 'public.comma-separated-values-text',
  },
} as const;
type ExportFileType = (typeof EXPORT_FILES)[ExportFormat];

// Preserve the CSV BOM when decoding bytes for the string-based Android writer.
const TEXT_DECODER = new TextDecoder('utf-8', { ignoreBOM: true });

export type { ExportFormat } from '../sync/dataExchange';

export interface ExportResult {
  readonly uri: string;
  readonly format: ExportFormat;
  readonly categoryCount: number;
  readonly expenseCount: number;
}

export type ImportResult = ImportSummary;

export function useExportData() {
  const store = useLocalStore();
  const { resolveName } = useCategoryLookup();

  return useMutation<ExportResult | null, Error, ExportFormat>({
    mutationFn: async (format) => {
      const payload = await buildExportFile({
        store,
        time: systemTime,
        format,
        resolveCategoryName: resolveName,
      });
      const content = TEXT_DECODER.decode(payload.bytes);
      const fileType = EXPORT_FILES[format];

      const uri =
        Platform.OS === 'android'
          ? await writeViaStorageAccessFramework(content, fileType)
          : await writeViaShareSheet(content, fileType);

      // `null` propagates the user's cancel — surfaced as a no-op by the UI.
      if (uri === null) return null;

      return {
        uri,
        format,
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
async function writeViaStorageAccessFramework(
  content: string,
  fileType: ExportFileType,
): Promise<string | null> {
  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;

  // SAF appends the extension based on the MIME type.
  const baseName = fileType.filename.replace(/\.[^.]+$/, '');
  const fileUri = await StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    baseName,
    fileType.mimeType,
  );
  await StorageAccessFramework.writeAsStringAsync(fileUri, content);
  return fileUri;
}

/**
 * iOS / others — write the export to the cache directory and open the
 * OS share sheet so the user can route it through "Save to Files" or
 * any other share target. Cache-directory writes are overwritten on
 * every export, so stale copies cannot accumulate.
 */
async function writeViaShareSheet(content: string, fileType: ExportFileType): Promise<string> {
  const file = new File(Paths.cache, fileType.filename);
  file.write(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: fileType.mimeType,
      dialogTitle: 'Spendium export',
      UTI: fileType.uti,
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
