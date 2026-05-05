import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  downloadExport,
  saveBlobAsFile,
  uploadExport,
  type ExportFormat,
  type ImportResult,
} from '../api/dataExchange';
import { EXPENSES_QUERY_KEY } from './useExpenses';
import { CATEGORIES_QUERY_KEY } from './useCategories';

/**
 * Triggers an export download in the chosen format. The mutation success
 * payload is the resolved filename so the caller can show "Saved as ...".
 */
export function useExport() {
  return useMutation({
    mutationFn: async (format: ExportFormat) => {
      const { blob, filename } = await downloadExport(format);
      saveBlobAsFile(blob, filename);
      return filename;
    },
  });
}

/**
 * Uploads an export file and merges it into the current account. Both the
 * categories and expenses caches are invalidated on success because import
 * touches both projection tables.
 */
export function useImport() {
  const queryClient = useQueryClient();
  return useMutation<ImportResult, Error, File>({
    mutationFn: (file: File) => uploadExport(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}
