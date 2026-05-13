/**
 * `SyncCloudDialog` — settings panel for cloud-drive sync.
 *
 * Layout mirrors `ExportImportDialog`:
 *   - Provider row (opens a nested picker for OneDrive / Google Drive).
 *   - Sign-in / sign-out button (provider-aware).
 *   - "Sync now" button — disabled until the user is signed in.
 *   - Status footer — "Last synced …" / "Synced. Applied X, uploaded Y."
 *     / "Sync failed: …".
 *
 * Success and error feedback is reported back to the parent via
 * `onShowStatus`, matching the pattern used by `ExportImportDialog` and
 * `ManageCategoriesDialog`. The dialog itself only renders read-only
 * snapshots of `useSync()`.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog, Divider, List, Text, useTheme } from 'react-native-paper';

import { AppDialog } from './AppDialog';
import { ThemedButton as Button } from './ThemedButton';
import { SyncProviderPickerDialog } from './SyncProviderPickerDialog';
import { useSync, type SyncProviderKey } from '../context/syncProvider';

export interface SyncCloudDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly onShowStatus: (msg: string) => void;
}

export function SyncCloudDialog({ visible, onDismiss, onShowStatus }: SyncCloudDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const {
    provider,
    providerConfigured,
    setProvider,
    isSignedIn,
    signingIn,
    signIn,
    signOut,
    syncing,
    syncNow,
    lastSyncedAt,
    lastResult,
    lastError,
  } = useSync();

  const [pickerOpen, setPickerOpen] = useState(false);
  const googleDisabled = provider === 'googledrive' && !providerConfigured;

  const onSignIn = async () => {
    try {
      await signIn();
      onShowStatus(translate('syncDialog.signIn'));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      onShowStatus(translate('syncDialog.statusError', { message }));
    }
  };

  const onSignOut = async () => {
    await signOut();
    onShowStatus(translate('syncDialog.signOut'));
  };

  const onSync = async () => {
    await syncNow();
    // Read the result post-await via a fresh closure — but the hook
    // already updated state, so we use the values it just set.
    // This callback runs in the same tick as the state updates, so the
    // closure refs we read may be stale. The status banner below the
    // buttons reflects the live state regardless.
    onShowStatus(translate('syncDialog.syncNow'));
  };

  return (
    <>
      <AppDialog
        visible={visible && !pickerOpen}
        onDismiss={onDismiss}
        title={translate('syncDialog.title')}
      >
        <Dialog.Content>
          <List.Item
            title={translate('syncDialog.provider')}
            description={translate(`syncDialog.providers.${provider}`)}
            left={(props) => <List.Icon {...props} icon="cloud-outline" />}
            onPress={() => setPickerOpen(true)}
          />

          <Divider style={{ marginVertical: 12 }} />

          {provider === 'none' ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {translate('syncDialog.notConfigured')}
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {!isSignedIn ? (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {translate('syncDialog.signInPrompt')}
                </Text>
              ) : null}

              {isSignedIn ? (
                <Button
                  mode="outlined"
                  icon="logout"
                  onPress={() => void onSignOut()}
                  disabled={syncing || signingIn}
                >
                  {translate('syncDialog.signOut')}
                </Button>
              ) : (
                <Button
                  mode="contained"
                  icon="login"
                  onPress={() => void onSignIn()}
                  loading={signingIn}
                  disabled={signingIn || !providerConfigured}
                >
                  {signingIn
                    ? translate('syncDialog.signingIn')
                    : translate('syncDialog.signIn')}
                </Button>
              )}

              <Button
                mode="contained"
                icon="sync"
                onPress={() => void onSync()}
                loading={syncing}
                disabled={!isSignedIn || syncing || signingIn}
              >
                {syncing ? translate('syncDialog.syncing') : translate('syncDialog.syncNow')}
              </Button>
            </View>
          )}

          <Divider style={{ marginVertical: 12 }} />

          <SyncStatusFooter
            lastSyncedAt={lastSyncedAt}
            lastError={lastError}
            lastApplied={lastResult?.remote.applied ?? null}
            lastUploaded={lastResult?.uploadedLocal ?? null}
          />
        </Dialog.Content>
      </AppDialog>

      <SyncProviderPickerDialog
        visible={pickerOpen}
        value={provider}
        googleDisabled={googleDisabled}
        onDismiss={() => setPickerOpen(false)}
        onPick={(p: SyncProviderKey) => {
          void setProvider(p);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function SyncStatusFooter({
  lastSyncedAt,
  lastError,
  lastApplied,
  lastUploaded,
}: {
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
  readonly lastApplied: number | null;
  readonly lastUploaded: number | null;
}) {
  const { t: translate } = useTranslation();
  const theme = useTheme();

  if (lastError !== null) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.error }}>
        {translate('syncDialog.statusError', { message: lastError })}
      </Text>
    );
  }

  if (lastApplied !== null && lastUploaded !== null) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {translate('syncDialog.statusSuccess', {
          applied: lastApplied,
          uploaded: lastUploaded,
        })}
      </Text>
    );
  }

  if (lastSyncedAt !== null) {
    const when = new Date(lastSyncedAt).toLocaleString();
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {translate('syncDialog.lastSynced', { when })}
      </Text>
    );
  }

  return (
    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
      {translate('syncDialog.neverSynced')}
    </Text>
  );
}
