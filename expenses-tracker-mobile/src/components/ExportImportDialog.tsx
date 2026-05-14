/**
 * `ExportImportDialog` — single dialog for both data export and import.
 *
 * Uses the same JSON snapshot format as the web frontend's
 * `expenses-tracker-frontend/src/components/ExportImportDialog.tsx`, so
 * files round-trip between platforms. CSV/ZIP packing is a web-only
 * feature for now.
 *
 * Two stacked sections separated by a divider:
 *   - **Export** — primary "Download file" button. Wires to
 *     `useExportData()`, which on Android opens the Storage Access
 *     Framework folder picker and on iOS / others opens the share sheet.
 *   - **Import** — outlined "Choose file…" button + an info banner
 *     warning that re-importing the same file creates duplicates.
 *
 * The dialog stays open after a finished operation and shows the
 * success / error summary inline (success-tonal vs error-tonal banner).
 * Auto-closing was tempting but hid the count statistics, which are the
 * most informative bit of feedback for the user.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog, Divider, Text, useTheme } from 'react-native-paper';

import { AppDialog } from './AppDialog';
import { ThemedButton as Button } from './ThemedButton';
import { useExportData, useImportData } from '../hooks/useDataExchange';

export interface ExportImportDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
}

interface StatusBanner {
  readonly tone: 'success' | 'error';
  readonly text: string;
}

export function ExportImportDialog({ visible, onDismiss }: ExportImportDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const exportData = useExportData();
  const importData = useImportData();
  const [status, setStatus] = useState<StatusBanner | null>(null);

  const busy = exportData.isPending || importData.isPending;

  // Discard the previous outcome when the dialog closes so a re-open
  // starts clean — keeps the effect-free invariant that `status` only
  // mutates in response to user actions handled in this component.
  const handleDismiss = () => {
    setStatus(null);
    onDismiss();
  };

  const onExport = async () => {
    // Clear any previous outcome so the banner reflects only the latest
    // attempt and a quick retry doesn't look like a stale message.
    setStatus(null);
    try {
      const r = await exportData.mutateAsync();
      // `null` means the user cancelled the folder picker (Android SAF) —
      // stay silent.
      if (!r) return;
      setStatus({
        tone: 'success',
        text: translate('settings.exportSuccess', {
          categories: r.categoryCount,
          expenses: r.expenseCount,
        }),
      });
    } catch (e) {
      setStatus({ tone: 'error', text: translate('settings.exportError') });
      console.warn('Export failed', e);
    }
  };

  const onImport = async () => {
    setStatus(null);
    try {
      const r = await importData.mutateAsync();
      if (!r) return;
      if (r.fatal !== undefined) {
        setStatus({ tone: 'error', text: translate('settings.importError') });
        console.warn('Import failed', r.fatal);
        return;
      }
      setStatus({
        tone: 'success',
        text: translate('settings.importSuccess', {
          categories: r.categoriesCreated,
          expenses: r.expensesCreated,
          skipped: r.skipped,
        }),
      });
    } catch (e) {
      setStatus({ tone: 'error', text: translate('settings.importError') });
      console.warn('Import failed', e);
    }
  };

  return (
    <AppDialog visible={visible} onDismiss={handleDismiss} title={translate('exportImportDialog.title')}>
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

        {status !== null && (
          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              backgroundColor:
                status.tone === 'success'
                  ? theme.colors.tertiaryContainer
                  : theme.colors.errorContainer,
            }}
          >
            <Text
              variant="bodyMedium"
              style={{
                color:
                  status.tone === 'success'
                    ? theme.colors.onTertiaryContainer
                    : theme.colors.onErrorContainer,
              }}
            >
              {status.text}
            </Text>
          </View>
        )}
      </Dialog.Content>
    </AppDialog>
  );
}
