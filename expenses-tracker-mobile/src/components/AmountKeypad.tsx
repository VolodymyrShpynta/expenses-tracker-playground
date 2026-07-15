/**
 * AmountKeypad — calculator-style numeric grid. Mobile port of the web
 * frontend's `AmountKeypad`, rendered with `Pressable` cells inside a
 * Paper-themed view. Layout matches the web version exactly so muscle
 * memory carries over.
 *
 *   ┌──────┬──────┬──────┬──────┬───────────┐
 *   │  7   │  8   │  9   │  ÷   │ backspace │
 *   ├──────┼──────┼──────┼──────┼───────────┤
 *   │  4   │  5   │  6   │  ×   │  📅 date  │
 *   ├──────┼──────┼──────┼──────┼───────────┤
 *   │  1   │  2   │  3   │  −   │           │
 *   ├──────┼──────┼──────┼──────┤  = / OK   │
 *   │ CCY  │  0   │  .   │  +   │           │
 *   └──────┴──────┴──────┴──────┴───────────┘
 *
 * The equals cell label toggles between `=` and `OK` based on
 * `hasOperator`, matching the web behaviour.
 */
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, useTheme, type MD3Theme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';

import { FONT_SCALES, useFontScale } from '../context/preferencesProvider';
import type { CalculatorAction, Operator } from '../utils/useCalculator';

// Gap (dp) between keypad cells, horizontally and vertically. Named because
// the flex-basis "gap compensation" in `styles` below leans on its exact value
// to keep every cell the same size despite the 2-row-tall equals key.
const KEYPAD_CELL_GAP = 4;

type Variant = 'num' | 'op' | 'special' | 'equals';

interface Cell {
  readonly id: string;
  readonly label: ReactNode;
  readonly variant: Variant;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

export interface AmountKeypadProps {
  readonly currency: string;
  readonly hasOperator: boolean;
  readonly canEquals: boolean;
  readonly disabled?: boolean;
  /** Minimum per-cell (row) height (dp). The keypad flex-fills whatever height
   *  its parent gives it; this only floors the rows on short screens where the
   *  sheet scrolls, so a key is never smaller than a comfortable touch target.
   *  Defaults to 48. */
  readonly cellHeight?: number;
  readonly dispatch: (a: CalculatorAction) => void;
  readonly onEquals: () => void;
  readonly onOpenDate: () => void;
  readonly onOpenCurrency: () => void;
}

// Memoized: the keypad is re-created on every keystroke in the parent
// dialog (the calculator expression changes), but its own inputs stay
// constant while typing digits. Wrapping in `memo` — combined with the
// parent passing stable (`useCallback`-wrapped) `dispatch` / `onEquals` /
// `onOpenDate` / `onOpenCurrency` handlers — lets every digit press after
// the first skip re-rendering all ~20 `Pressable` cells, which is the
// dominant cost of the per-keypress lag (worst right after a cold start).
export const AmountKeypad = memo(function AmountKeypad({
  currency,
  hasOperator,
  canEquals,
  disabled,
  cellHeight: cellHeightProp,
  dispatch,
  onEquals,
  onOpenDate,
  onOpenCurrency,
}: AmountKeypadProps) {
  const theme = useTheme();
  // Honor Settings → Font size. Cells keep a generous `minHeight`, so the
  // scaled digits grow within the button rather than resizing the grid.
  const { fontScale } = useFontScale();
  const scale = FONT_SCALES[fontScale];

  const cellGap = KEYPAD_CELL_GAP;
  // Minimum row height — only floors the rows on short screens where the sheet
  // scrolls; on a normal sheet the rows flex to fill the available space.
  const minRow = cellHeightProp ?? 48;
  // Scale glyphs/icons with the screen (NOT a measured cell height, which would
  // force a second render): bigger phones get bigger labels. Computed on the
  // first render, so the keypad paints at its final size immediately.
  const { height: windowHeight } = useWindowDimensions();
  const glyphScale = Math.min(1.3, Math.max(1, windowHeight / 760));
  const iconSize = Math.round(20 * glyphScale);

  const digit = (d: string): Cell => ({
    id: d,
    label: d,
    variant: 'num',
    onPress: () => dispatch(d === '.' ? { type: 'decimal' } : { type: 'digit', value: d }),
  });

  const op = (o: Operator, label?: ReactNode): Cell => ({
    id: o,
    label: label ?? o,
    variant: 'op',
    onPress: () => dispatch({ type: 'operator', value: o }),
  });

  const special = (id: string, label: ReactNode, onPress: () => void): Cell => ({
    id, label, variant: 'special', onPress,
  });

  const equals = (): Cell => ({
    id: 'equals',
    label: hasOperator ? '=' : 'OK',
    variant: 'equals',
    onPress: onEquals,
    disabled: !canEquals,
  });

  const renderCell = (cell: Cell) => {
    const palette = cellPalette(theme, cell.variant);
    return (
      <Pressable
        key={cell.id}
        onPress={cell.onPress}
        disabled={disabled || cell.disabled}
        style={({ pressed }) => [
          styles.cell,
          {
            backgroundColor: pressed ? palette.bgPressed : palette.bg,
            opacity: disabled || cell.disabled ? 0.5 : 1,
          },
        ]}
      >
        {typeof cell.label === 'string' ? (
          <Text
            style={{
              color: palette.color,
              fontSize: Math.round(
                (cell.variant === 'equals' ? (hasOperator ? 24 : 16) : 18) * scale * glyphScale,
              ),
              fontWeight: cell.variant === 'equals' || cell.variant === 'op' ? '700' : '500',
            }}
          >
            {cell.label}
          </Text>
        ) : (
          cell.label
        )}
      </Pressable>
    );
  };

  // The keypad flex-fills its parent's height. Every visual row is an equal
  // flex band; the equals/OK key spans the bottom two rows by living in a
  // dedicated right column beside a 2-row left block — no fixed pixel heights
  // or negative margins, so it paints correctly on the first frame (no
  // measure-then-resize flash). The `flexBasis` values in `styles` are gap
  // compensation so every cell ends up exactly the same size despite the
  // nesting.
  const rowMin = { minHeight: minRow };
  return (
    <View style={styles.keypad}>
      <View style={[styles.row, rowMin]}>
        <View style={styles.leftBlock}>
          {renderCell(digit('7'))}
          {renderCell(digit('8'))}
          {renderCell(digit('9'))}
          {renderCell(op('\u00f7'))}
        </View>
        {renderCell(
          special(
            'backspace',
            <MaterialIcons name="backspace" size={iconSize} color={theme.colors.onSurfaceVariant} />,
            () => dispatch({ type: 'backspace' }),
          ),
        )}
      </View>

      <View style={[styles.row, rowMin]}>
        <View style={styles.leftBlock}>
          {renderCell(digit('4'))}
          {renderCell(digit('5'))}
          {renderCell(digit('6'))}
          {renderCell(op('\u00d7'))}
        </View>
        {renderCell(
          special(
            'date',
            <MaterialIcons name="calendar-today" size={iconSize} color={theme.colors.onSurfaceVariant} />,
            onOpenDate,
          ),
        )}
      </View>

      <View style={[styles.bottomSection, { minHeight: minRow * 2 + cellGap }]}>
        <View style={styles.leftBlockColumn}>
          <View style={[styles.row, rowMin]}>
            {renderCell(digit('1'))}
            {renderCell(digit('2'))}
            {renderCell(digit('3'))}
            {renderCell(op('-', '\u2212'))}
          </View>
          <View style={[styles.row, rowMin]}>
            {renderCell(special('currency', currency, onOpenCurrency))}
            {renderCell(digit('0'))}
            {renderCell(digit('.'))}
            {renderCell(op('+'))}
          </View>
        </View>
        {renderCell(equals())}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  keypad: {
    width: '100%',
    flexGrow: 1,
    gap: KEYPAD_CELL_GAP,
  },
  // Every visual row is an equal flex band (`flexBasis: 0` + `flexGrow: 1`).
  // Reused for the two top rows AND the two bottom sub-rows so all four are the
  // same height.
  row: {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: 'row',
    gap: KEYPAD_CELL_GAP,
  },
  // Holds the bottom two rows next to the tall equals key. `flexGrow: 2` makes
  // it twice a single row; the extra `flexBasis` of one gap makes its two
  // sub-rows line up exactly with the single top rows.
  bottomSection: {
    flexGrow: 2,
    flexBasis: KEYPAD_CELL_GAP,
    flexDirection: 'row',
    gap: KEYPAD_CELL_GAP,
  },
  // The 4-wide left block beside the 1-wide right column. `flexGrow: 4` +
  // `flexBasis: 3 gaps` makes all five columns exactly equal width despite the
  // gap between the block and the right column.
  leftBlock: {
    flexGrow: 4,
    flexBasis: KEYPAD_CELL_GAP * 3,
    flexDirection: 'row',
    gap: KEYPAD_CELL_GAP,
  },
  leftBlockColumn: {
    flexGrow: 4,
    flexBasis: KEYPAD_CELL_GAP * 3,
    gap: KEYPAD_CELL_GAP,
  },
  cell: {
    flexGrow: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
});

interface Palette {
  readonly bg: string;
  readonly bgPressed: string;
  readonly color: string;
}

/**
 * Map keypad variants onto Material 3 semantic tokens. Numeric and
 * special cells use neutral surface tokens; operator cells live in the
 * secondary container (green family); the equals/OK cell uses solid
 * `secondary` and flips to `primary` on press for a high-contrast
 * "submit" cue. No raw color literals — all colors flow from the
 * Paper theme so light/dark/branding stay consistent.
 */
function cellPalette(theme: MD3Theme, variant: Variant): Palette {
  switch (variant) {
    case 'equals':
      return {
        bg: theme.colors.secondary,
        bgPressed: theme.colors.primary,
        color: theme.colors.onSecondary,
      };
    case 'op':
      return {
        bg: theme.colors.secondaryContainer,
        bgPressed: theme.colors.tertiaryContainer,
        color: theme.colors.onSecondaryContainer,
      };
    case 'num':
    case 'special':
      return {
        bg: theme.colors.surfaceVariant,
        bgPressed: theme.colors.outlineVariant,
        color: theme.colors.onSurfaceVariant,
      };
  }
}
