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
import { Dialog, Divider, IconButton, List, Switch, Text, useTheme } from 'react-native-paper';

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
    autoSyncEnabled,
    setAutoSyncEnabled,
  } = useSync();

  const [pickerOpen, setPickerOpen] = useState(false);
  // Tap-to-open popup explaining when auto-sync actually runs. Mirrors
  // the iOS "(i) info button" pattern — more discoverable on mobile than
  // a long-press tooltip, and works the same on Android.
  const [autoSyncInfoOpen, setAutoSyncInfoOpen] = useState(false);
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
        visible={visible && !pickerOpen && !autoSyncInfoOpen}
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

          <List.Item
            title={translate('syncDialog.autoSync')}
            description={translate('syncDialog.autoSyncDescription')}
            left={(props) => <List.Icon {...props} icon="autorenew" />}
            right={() => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconButton
                  icon="information-outline"
                  size={20}
                  onPress={() => setAutoSyncInfoOpen(true)}
                  accessibilityLabel={translate('syncDialog.autoSyncInfo')}
                />
                <Switch
                  value={autoSyncEnabled}
                  onValueChange={(v) => void setAutoSyncEnabled(v)}
                  accessibilityLabel={translate('syncDialog.autoSync')}
                />
              </View>
            )}
            onPress={() => void setAutoSyncEnabled(!autoSyncEnabled)}
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
            lastApplied={
              lastResult
                ? lastResult.remote.applied + lastResult.remoteCategories.applied
                : null
            }
            lastUploaded={
              lastResult
                ? lastResult.uploadedLocal + lastResult.uploadedLocalCategories
                : null
            }
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

      <AppDialog
        visible={autoSyncInfoOpen}
        onDismiss={() => setAutoSyncInfoOpen(false)}
        title={translate('syncDialog.autoSync')}
      >
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {translate('syncDialog.autoSyncDescriptionFull')}
          </Text>
        </Dialog.Content>
      </AppDialog>
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

  const timestampLine =
    lastSyncedAt !== null
      ? translate('syncDialog.lastSynced', { when: new Date(lastSyncedAt).toLocaleString() })
      : translate('syncDialog.neverSynced');

  return (
    <>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {timestampLine}
      </Text>
      {lastApplied !== null && lastUploaded !== null && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {lastApplied === 0 && lastUploaded === 0
            ? translate('syncDialog.statusUpToDate')
            : translate('syncDialog.statusSuccess', {
                applied: lastApplied,
                uploaded: lastUploaded,
              })}
        </Text>
      )}
    </>
  );
}
