/**
 * `TextInput` wrapper that avoids the well-known react-native-paper
 * Portal cursor bug.
 *
 * When a controlled `<TextInput value={...} onChangeText={...} />` is
 * rendered inside `<Portal>` (transitively: any Paper `Dialog`, our
 * custom bottom sheet, etc.), typing in the **middle** of the text
 * causes the cursor to jump back one character on every keystroke on
 * Android — characters end up scrambled. Tracked upstream as
 *
 *   - https://github.com/callstack/react-native-paper/issues/1668
 *   - https://github.com/callstack/react-native-paper/issues/2565
 *
 * The accepted workaround is to give the input its own local state, so
 * the value flowing back into the native side is the same instance the
 * native side produced. We still notify the parent on every change so
 * derived state (suggestions, validation, submit payload) stays in
 * sync. External writes to `value` (e.g. clearing the field after
 * submit, seeding from a picked suggestion) are honoured by resetting
 * `localValue` during render when the parent's `value` prop changes —
 * the React-recommended alternative to a sync `useEffect`
 * (see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
 */
import { useState } from 'react';
import { TextInput } from 'react-native-paper';
import type { ComponentProps } from 'react';

type TextInputProps = ComponentProps<typeof TextInput>;

export interface PortalSafeTextInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}

export function PortalSafeTextInput({
  value,
  onChangeText,
  ...rest
}: PortalSafeTextInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [lastSyncedValue, setLastSyncedValue] = useState(value);

  // Adjust state during render when the parent's `value` changes — no
  // effect needed, no cascading render.
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setLocalValue(value);
  }

  return (
    <TextInput
      {...rest}
      value={localValue}
      onChangeText={(text) => {
        setLocalValue(text);
        onChangeText(text);
      }}
    />
  );
}
