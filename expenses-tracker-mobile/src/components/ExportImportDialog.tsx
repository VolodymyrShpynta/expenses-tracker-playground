/**
 * `ExportImportDialog` — single dialog for both data export and import.
 *
 * Mirrors the layout of the web frontend's
 * `expenses-tracker-frontend/src/components/ExportImportDialog.tsx`,
 * but adapted to React Native Paper and to the **JSON-only** wire format
 * supported on mobile (the local importer auto-detects gzip via magic
 * bytes; CSV/ZIP packing is a web-only feature for now).
 *
 * Two stacked sections separated by a divider:
 *   - **Export** — primary "Download file" button. Wires to
 *     `useExportData()`, which writes a `.json` file to the cache
 *     directory and hands the URI to `expo-sharing`.
 *   - **Import** — outlined "Choose file…" button + an info banner
 *     warning that re-importing the same file creates duplicates.
 *
 * Success / error feedback is reported back to the parent via
 * `onShowStatus`, matching the pattern used by `ManageCategoriesDialog`.
 */
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog, Divider, Text, useTheme } from 'react-native-paper';

import { AppDialog } from './AppDialog';
import { ThemedButton as Button } from './ThemedButton';
import { useExportData, useImportData } from '../hooks/useDataExchange';

export interface ExportImportDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly onShowStatus: (msg: string) => void;
}

export function ExportImportDialog({ visible, onDismiss, onShowStatus }: ExportImportDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const exportData = useExportData();
  const importData = useImportData();

  const busy = exportData.isPending || importData.isPending;

  const onExport = async () => {
    try {
      const r = await exportData.mutateAsync();
      onShowStatus(translate('settings.exportSuccess', { count: r.eventCount }));
    } catch (e) {
      onShowStatus(translate('settings.exportError'));
      console.warn('Export failed', e);
    }
  };

  const onImport = async () => {
    try {
      const r = await importData.mutateAsync();
      if (!r) return;
      onShowStatus(translate('settings.importSuccess', { applied: r.applied, skipped: r.skipped }));
    } catch (e) {
      onShowStatus(translate('settings.importError'));
      console.warn('Import failed', e);
    }
  };

  return (
    <AppDialog visible={visible} onDismiss={onDismiss} title={translate('exportImportDialog.title')}>
      <Dialog.Content>
        <View style={{ gap: 8 }}>
          <Text variant="titleSmall">{translate('exportImportDialog.exportTitle')}</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {translate('exportImportDialog.exportBody')}
          </Text>
          <Button
            mode="contained"
            icon="download"
            onPress={() => void onExport()}
            loading={exportData.isPending}
            disabled={busy}
          >
            {exportData.isPending
              ? translate('exportImportDialog.exporting')
              : translate('exportImportDialog.exportButton')}
          </Button>
        </View>

        <Divider style={{ marginVertical: 16 }} />

        <View style={{ gap: 8 }}>
          <Text variant="titleSmall">{translate('exportImportDialog.importTitle')}</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {translate('exportImportDialog.importBody')}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              padding: 12,
              borderRadius: 8,
              backgroundColor: theme.colors.secondaryContainer,
              marginVertical: 4,
            }}
          >
            <Text style={{ color: theme.colors.onSecondaryContainer, fontSize: 18 }}>ℹ︎</Text>
            <Text
              variant="bodySmall"
              style={{ flex: 1, color: theme.colors.onSecondaryContainer }}
            >
              {translate('exportImportDialog.importWarning')}
            </Text>
          </View>

          <Button
            mode="outlined"
            icon="upload"
            onPress={() => void onImport()}
            loading={importData.isPending}
            disabled={busy}
          >
            {importData.isPending
              ? translate('exportImportDialog.importing')
              : translate('exportImportDialog.importButton')}
          </Button>
        </View>
      </Dialog.Content>
    </AppDialog>
  );
}
