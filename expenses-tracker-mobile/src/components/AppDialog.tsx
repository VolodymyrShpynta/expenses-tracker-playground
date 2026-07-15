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
 *   - A computed `maxHeight` (screen height minus the OS safe-area insets
 *     and, when `reserveBottomNav` is set, the in-app bottom tab bar) so a
 *     tall dialog auto-grows with content but never covers the full screen
 *     or overlaps the bottom navigation
 *   - Reduced horizontal margin so the dialog uses more of the screen
 *
 * Two title-bar shapes
 * --------------------
 *   - **Default** (`showCloseButton: true`, the default) — used by the
 *     Category picker, Manage Categories, and the Language picker: a
 *     custom title row with a close (X) button on the right edge, so
 *     the user can always dismiss without committing to a selection.
 *   - **No close button** (`showCloseButton: false`) — used by the
 *     Currency / Dark mode / Font size pickers: a plain
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
import { type ReactNode, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Dialog,
  IconButton,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useFontScale } from '../context/preferencesProvider';
import { tabBarBodyHeight } from '../theme/tabBar';

// Smallest height we'll ever cap a dialog to, so a misreported window size
// can't collapse the dialog to nothing.
const MIN_DIALOG_HEIGHT = 320;

// Breathing room kept between the dialog and the reserved region edges so
// the action buttons never sit flush against the system nav / tab bar.
const DIALOG_VERTICAL_GAP = 16;

export interface AppDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly title: string;
  readonly children: ReactNode;
  /**
   * Render a close (X) button on the right side of the title row.
   * Defaults to `true`. Set to `false` for radio-list pickers that
   * auto-dismiss on selection (Currency, Dark mode, Font size) so the
   * redundant X doesn't add visual noise.
   */
  readonly showCloseButton?: boolean;
  /**
   * Reserve vertical space for the in-app bottom tab bar. Paper's `Modal`
   * vertically centres the dialog within the OS safe-area insets only — it
   * has no knowledge of our tab bar — so a tall dialog opened over the main
   * tabs (e.g. the date pickers) would otherwise overlap it. Defaults to
   * `false` (the Settings-screen pickers have no tab bar beneath them).
   */
  readonly reserveBottomNav?: boolean;
}

export function AppDialog({
  visible,
  onDismiss,
  title,
  children,
  showCloseButton = true,
  reserveBottomNav = false,
}: AppDialogProps) {
  const theme = useTheme();
  const { t: translate } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { fontScale } = useFontScale();

  // Reserve space for the in-app tab bar (0 when the dialog isn't shown over
  // the tabs) so the vertically-centred dialog is lifted clear of it. Shares
  // the tab-bar geometry with the navigator via `src/theme/tabBar.ts`.
  const bottomReserve = reserveBottomNav ? tabBarBodyHeight(fontScale) : 0;

  // Cap the dialog to the space between the status bar and the system nav +
  // tab bar so its content — crucially the action buttons — can't extend
  // into the bottom navigation.
  const maxHeight = Math.max(
    MIN_DIALOG_HEIGHT,
    windowHeight - insets.top - insets.bottom - bottomReserve - DIALOG_VERTICAL_GAP,
  );

  // Override the bottom inset Paper's `Modal` reads so the vertically
  // centred dialog is lifted clear of the tab bar as well as the OS nav.
  const insetsWithNav = useMemo(
    () => ({ ...insets, bottom: insets.bottom + bottomReserve }),
    [insets, bottomReserve],
  );

  const dialog = (
    <Dialog
      visible={visible}
      onDismiss={onDismiss}
      style={[styles.dialog, { backgroundColor: theme.colors.background, maxHeight }]}
    >
      {showCloseButton ? (
        <View style={styles.titleRow}>
          <Text
            variant="headlineSmall"
            style={styles.titleText}
            // Keep the title on one line, shrinking the font just enough for a
            // long word/title (e.g. UK "Автосинхронізація") so it never breaks
            // mid-word against the narrower, close-button-adjacent title area.
            numberOfLines={1}
            adjustsFontSizeToFit
          >
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
  );

  return (
    <Portal>
      {reserveBottomNav ? (
        <SafeAreaInsetsContext.Provider value={insetsWithNav}>
          {dialog}
        </SafeAreaInsetsContext.Provider>
      ) : (
        dialog
      )}
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    // `maxHeight` is computed per-render (screen height minus the safe-area
    // insets and, when requested, the bottom tab bar) and merged in via the
    // inline style so the dialog never overlaps the bottom navigation.
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
