/**
 * Cloud-sync provider picker — Disabled / OneDrive / Google Drive.
 *
 * Mirrors the radio-list pattern used by `ThemeModePickerDialog`. Built
 * on top of `AppDialog` for the shared title row + close button.
 *
 * The Google Drive row is rendered with a hint when `disabled` is set
 * (the adapter still ships with a placeholder client ID).
 */
import { Dialog, RadioButton, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import { AppRadioItem } from './AppRadioItem';
import type { SyncProviderKey } from '../context/syncProvider';

export interface SyncProviderPickerDialogProps {
  readonly visible: boolean;
  readonly value: SyncProviderKey;
  readonly googleDisabled: boolean;
  readonly onDismiss: () => void;
  readonly onPick: (p: SyncProviderKey) => void;
}

const PROVIDERS: ReadonlyArray<SyncProviderKey> = ['none', 'onedrive', 'googledrive'];

export function SyncProviderPickerDialog({
  visible,
  value,
  googleDisabled,
  onDismiss,
  onPick,
}: SyncProviderPickerDialogProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      title={translate('syncDialog.provider')}
      showCloseButton={false}
    >
      <Dialog.Content>
        <RadioButton.Group
          value={value}
          onValueChange={(v) => {
            const next = v as SyncProviderKey;
            if (next === 'googledrive' && googleDisabled) return;
            onPick(next);
          }}
        >
          {PROVIDERS.map((p) => (
            <AppRadioItem
              key={p}
              value={p}
              label={translate(`syncDialog.providers.${p}`)}
              disabled={p === 'googledrive' && googleDisabled}
            />
          ))}
        </RadioButton.Group>
        {googleDisabled ? (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
          >
            {translate('syncDialog.googleDisabled')}
          </Text>
        ) : null}
      </Dialog.Content>
    </AppDialog>
  );
}
