/**
 * Font-size picker — Small / Medium / Large / X-Large. Trivial radio-list
 * dialog built on `AppDialog` so it shares the title row + close button
 * with every other picker.
 */
import { Dialog, RadioButton } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { AppDialog } from './AppDialog';
import type { FontScaleKey } from '../context/preferencesProvider';

export interface FontSizePickerDialogProps {
  readonly visible: boolean;
  readonly value: FontScaleKey;
  readonly onDismiss: () => void;
  readonly onPick: (size: FontScaleKey) => void;
}

const SCALES: ReadonlyArray<FontScaleKey> = ['small', 'medium', 'large', 'xlarge'];

export function FontSizePickerDialog({
  visible,
  value,
  onDismiss,
  onPick,
}: FontSizePickerDialogProps) {
  const { t: translate } = useTranslation();
  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      title={translate('settings.fontSize')}
      showCloseButton={false}
    >
      <Dialog.Content>
        <RadioButton.Group value={value} onValueChange={(v) => onPick(v as FontScaleKey)}>
          {SCALES.map((s) => (
            <RadioButton.Item
              key={s}
              value={s}
              label={translate(`settings.fontScale.${s}`)}
            />
          ))}
        </RadioButton.Group>
      </Dialog.Content>
    </AppDialog>
  );
}
