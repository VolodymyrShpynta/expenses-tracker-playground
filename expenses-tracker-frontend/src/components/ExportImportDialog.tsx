import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { useTranslation } from 'react-i18next';
import type { ExportFormat, ImportResult } from '../api/dataExchange.ts';
import { useExport, useImport } from '../hooks/useDataExchange.ts';

interface ExportImportDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Settings dialog hosting the export / import flow. Two stacked
 * sections so the user can pick a format once and reuse it for both
 * directions:
 *
 * - **Export** downloads either a self-contained JSON file (lossless) or
 *   a ZIP holding `categories.csv` + `expenses.csv` (spreadsheet-friendly).
 * - **Import** uploads a `.json`, `.zip`, or `.csv` file. The server
 *   dispatches on the extension and reuses the user's existing categories
 *   when it can match by `templateKey` or name (case-insensitive), so
 *   re-importing the same file does not duplicate categories.
 *
 * Imported expenses are always appended (consistent with how every other
 * consumer expense app handles export uploads). The dialog spells this
 * out in a warning Alert above the upload button.
 */
export function ExportImportDialog({ open, onClose }: ExportImportDialogProps) {
  const { t: translate } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const exportMutation = useExport();
  const importMutation = useImport();

  const handleExport = () => {
    setImportResult(null);
    exportMutation.mutate(format);
  };

  const handlePickFile = () => {
    setImportResult(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset the input value immediately so picking the same file twice in
    // a row still triggers `change` (browsers suppress duplicate events).
    event.target.value = '';
    if (!file) return;
    importMutation.mutate(file, {
      onSuccess: (result) => setImportResult(result),
    });
  };

  const exportError = exportMutation.error instanceof Error ? exportMutation.error.message : null;
  const importError = importMutation.error instanceof Error ? importMutation.error.message : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{translate('exportImportDialog.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {translate('exportImportDialog.formatLabel')}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={format}
              onChange={(_event, value: ExportFormat | null) => {
                if (value) setFormat(value);
              }}
              fullWidth
            >
              <ToggleButton value="json">{translate('exportImportDialog.formatJson')}</ToggleButton>
              <ToggleButton value="csv">{translate('exportImportDialog.formatCsv')}</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {translate(
                format === 'json'
                  ? 'exportImportDialog.formatJsonHint'
                  : 'exportImportDialog.formatCsvHint',
              )}
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {translate('exportImportDialog.exportTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {translate('exportImportDialog.exportBody')}
            </Typography>
            <Button
              variant="contained"
              fullWidth
              startIcon={
                exportMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />
              }
              onClick={handleExport}
              disabled={exportMutation.isPending || importMutation.isPending}
            >
              {exportMutation.isPending
                ? translate('exportImportDialog.exporting')
                : translate('exportImportDialog.exportButton')}
            </Button>
            {exportError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>{exportError}</Alert>
            )}
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {translate('exportImportDialog.importTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {translate('exportImportDialog.importBody')}
            </Typography>
            <Alert severity="info" sx={{ mb: 1.5 }}>
              {translate('exportImportDialog.importWarning')}
            </Alert>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.zip,.csv,application/json,application/zip,text/csv"
              hidden
              onChange={handleFileChange}
            />
            <Button
              variant="outlined"
              fullWidth
              startIcon={
                importMutation.isPending ? <CircularProgress size={16} /> : <UploadIcon />
              }
              onClick={handlePickFile}
              disabled={exportMutation.isPending || importMutation.isPending}
            >
              {importMutation.isPending
                ? translate('exportImportDialog.importing')
                : translate('exportImportDialog.importButton')}
            </Button>

            {importError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>{importError}</Alert>
            )}

            {importResult && importResult.fatal && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                <AlertTitle>
                  {translate('exportImportDialog.importFatalTitle')}
                </AlertTitle>
                {importResult.fatal}
              </Alert>
            )}

            {importResult && !importResult.fatal && (
              <Alert
                severity={importResult.errors.length > 0 ? 'warning' : 'success'}
                sx={{ mt: 1.5 }}
              >
                <AlertTitle>
                  {translate('exportImportDialog.importResultTitle')}
                </AlertTitle>
                {translate('exportImportDialog.importResultSummary', {
                  categories: importResult.categoriesCreated,
                  expenses: importResult.expensesCreated,
                  skipped: importResult.skipped,
                })}
                {importResult.errors.length > 0 && (
                  <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>
                        <Typography variant="caption">
                          {translate('exportImportDialog.importRowError', {
                            kind: translate(`exportImportDialog.rowKind.${err.kind}`),
                            label: err.label,
                            message: err.message ?? '',
                          })}
                        </Typography>
                      </li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>
                        <Typography variant="caption">
                          {translate('exportImportDialog.importMoreErrors', {
                            count: importResult.errors.length - 5,
                          })}
                        </Typography>
                      </li>
                    )}
                  </Box>
                )}
              </Alert>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
