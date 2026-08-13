/**
 * Theme-mode picker — the three neutral themes, then the accented ones. Radio
 * list built on `AppDialog` so it shares the title row with every other picker;
 * it scrolls because the list is now longer than a short screen.
 */
import { ScrollView } from 'react-native';
import { Dialog, RadioButton } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import { AppRadioItem } from './AppRadioItem';
import { THEME_MODES, type ThemeMode } from '../theme/theme';

export interface ThemeModePickerDialogProps {
  readonly visible: boolean;
  readonly value: ThemeMode;
  readonly onDismiss: () => void;
  readonly onPick: (mode: ThemeMode) => void;
}

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
      <Dialog.ScrollArea>
        <ScrollView>
          <RadioButton.Group value={value} onValueChange={(v) => onPick(v as ThemeMode)}>
            {THEME_MODES.map((m) => (
              <AppRadioItem
                key={m}
                value={m}
                label={translate(`settings.themeMode.${m}`)}
              />
            ))}
          </RadioButton.Group>
        </ScrollView>
      </Dialog.ScrollArea>
    </AppDialog>
  );
}
