/**
 * Theme-mode picker — System / Light / Dark. Trivial radio-list dialog
 * built on `AppDialog` so it shares the title row + close button with
 * every other picker.
 */
import { Dialog, RadioButton } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import type { ThemeMode } from '../context/preferencesProvider';

export interface ThemeModePickerDialogProps {
  readonly visible: boolean;
  readonly value: ThemeMode;
  readonly onDismiss: () => void;
  readonly onPick: (mode: ThemeMode) => void;
}

const MODES: ReadonlyArray<ThemeMode> = ['system', 'light', 'dark'];

export function ThemeModePickerDialog({
  visible,
  value,
  onDismiss,
  onPick,
}: ThemeModePickerDialogProps) {
  const { t: translate } = useTranslation();
  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      title={translate('settings.darkMode')}
      showCloseButton={false}
    >
      <Dialog.Content>
        <RadioButton.Group value={value} onValueChange={(v) => onPick(v as ThemeMode)}>
          {MODES.map((m) => (
            <RadioButton.Item
              key={m}
              value={m}
              label={translate(`settings.themeMode.${m}`)}
            />
          ))}
        </RadioButton.Group>
      </Dialog.Content>
    </AppDialog>
  );
}
