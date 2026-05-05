import { fetchWithAuth } from './fetchWithAuth';
import { handleResponse } from './handleResponse';

/**
 * Export file formats supported by the import/export endpoints.
 *
 * - `json`: app-native, lossless. Round-trips every field. Recommended
 *   for moving data between this app's instances.
 * - `csv`: ZIP containing `categories.csv` and `expenses.csv`. Lossy
 *   for category metadata edits but readable in any spreadsheet.
 */
export type ExportFormat = 'json' | 'csv';

/**
 * Per-row import failure surfaced by the backend. The kind / label
 * pair lets the UI format the prefix consistently (and translate it),
 * while `message` carries the underlying validation error verbatim.
 */
export interface RowError {
  kind: 'category' | 'expense';
  label: string;
  message: string | null;
}

export interface ImportResult {
  categoriesCreated: number;
  expensesCreated: number;
  skipped: number;
  /**
   * Per-row failures from a partially-successful import. Empty when the
   * upload either fully succeeded or failed wholesale (see `fatal`).
   */
  errors: RowError[];
  /**
   * Set when the upload as a whole could not be processed (e.g.
   * malformed JSON, missing required CSV entry). When present,
   * `categoriesCreated` and `expensesCreated` are 0.
   */
  fatal: string | null;
}

const BASE = '/api/data';
const FALLBACK_EXPORT_FILENAME = 'expenses-tracker-export';

/**
 * Downloads an export file in the requested format. Resolves to the raw
 * response Blob plus the filename suggested by the server's
 * `Content-Disposition` header so the caller can hand the blob to the
 * browser's standard "save file" anchor flow.
 */
export async function downloadExport(
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetchWithAuth(`${BASE}/export?format=${format}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  const blob = await res.blob();
  const filename =
    parseFilename(res.headers.get('Content-Disposition')) ?? FALLBACK_EXPORT_FILENAME;
  return { blob, filename };
}

/**
 * Uploads an export file to be merged into the current account. Format is
 * inferred server-side from the filename extension (.json / .zip / .csv).
 */
export async function uploadExport(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithAuth(`${BASE}/import`, { method: 'POST', body: form });
  return handleResponse<ImportResult>(res);
}

/**
 * Saves the blob through a temporary anchor click — the canonical
 * approach for triggering a download from XHR/fetch responses without a
 * dedicated download URL on the server.
 */
export function saveBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Pulls `filename="..."` out of a Content-Disposition header value. The
 * backend always emits the plain (RFC 2616) form, so we don't bother
 * with the `filename*=UTF-8''...` variant — supporting it without
 * actually URL-decoding would be a lie.
 */
function parseFilename(header: string | null): string | null {
  if (!header) return null;
  return /filename="?([^";]+)"?/i.exec(header)?.[1] ?? null;
}
