/**
 * `AppDialog` — common chrome for all picker dialogs.
 *
 * What it does
 * ------------
 * Wraps `Paper.Dialog` + `Portal` and pre-fills the decisions we want
 * every picker to share:
 *
 *   - Single-row title bar with the title text on the left and an
 *     optional close (X) button on the right
 *   - Themed background that matches the app's screen surface
 *     (`theme.colors.background`)
 *   - `maxHeight: '92%'` — dialog auto-grows with content but never
 *     covers the full screen
 *   - Reduced horizontal margin so the dialog uses more of the screen
 *
 * Two title-bar shapes
 * --------------------
 *   - **Default** (`showCloseButton: true`, the default) — used by the
 *     Category picker and Manage Categories: a custom title row with a
 *     close (X) button on the right edge, because those dialogs do not
 *     auto-dismiss on selection (search-and-pick / multi-action).
 *   - **No close button** (`showCloseButton: false`) — used by the
 *     Language / Currency / Dark mode / Font size pickers: a plain
 *     `Dialog.Title` row, because those dialogs auto-dismiss as soon as
 *     the user picks a radio option, so the X would be redundant.
 *
 * Why a wrapper (and not just inlining `Paper.Dialog` everywhere)
 * --------------------------------------------------------------
 * Six picker dialogs share this chrome. Inlining means three lines of
 * style × six files — drift is inevitable. This wrapper is ~50 lines,
 * has no abstractions over Paper, and stays out of the layout decisions
 * of each dialog.
 *
 * What it deliberately does NOT do
 * --------------------------------
 *   - It is not a "bottom sheet" or "full-screen" mode. The Add/Edit
 *     Expense surface uses a custom in-tree overlay (calculator keypad)
 *     and is not routed through this wrapper.
 *   - It does not own inner padding. Callers wrap their content in
 *     `Dialog.Content` / `Dialog.ScrollArea` (re-exported from
 *     `react-native-paper`) however they need.
 */
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Dialog,
  IconButton,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';

export interface AppDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly title: string;
  readonly children: ReactNode;
  /**
   * Render a close (X) button on the right side of the title row.
   * Defaults to `true`. Set to `false` for radio-list pickers that
   * auto-dismiss on selection (Language, Currency, Dark mode, Font
   * size) so the redundant X doesn't add visual noise.
   */
  readonly showCloseButton?: boolean;
}

export function AppDialog({
  visible,
  onDismiss,
  title,
  children,
  showCloseButton = true,
}: AppDialogProps) {
  const theme = useTheme();
  const { t: translate } = useTranslation();

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={[styles.dialog, { backgroundColor: theme.colors.background }]}
      >
        {showCloseButton ? (
          <View style={styles.titleRow}>
            <Text variant="headlineSmall" style={styles.titleText}>
              {title}
            </Text>
            <IconButton
              icon="close"
              size={24}
              onPress={onDismiss}
              accessibilityLabel={translate('common.close')}
              style={styles.closeButton}
            />
          </View>
        ) : (
          <Dialog.Title>{title}</Dialog.Title>
        )}
        {children}
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    // Auto-grow with content but never exceed 92% of screen height.
    // Paper's `Dialog.ScrollArea` flexes correctly inside this bound.
    maxHeight: '92%',
    marginHorizontal: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    paddingRight: 14,
    paddingTop: 4,
    paddingBottom: 16,
  },
  titleText: {
    flex: 1,
    fontWeight: '600',
  },
  closeButton: {
    // Drop `IconButton`'s default margin so the X sits flush against
    // the dialog's right edge instead of nudging the title.
    margin: 0,
  },
});
