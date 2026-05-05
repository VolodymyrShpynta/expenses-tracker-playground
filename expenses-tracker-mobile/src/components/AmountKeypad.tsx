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
import { Pressable, View, type DimensionValue, type ViewStyle } from 'react-native';
import { Text, useTheme, type MD3Theme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';

import type { CalculatorAction, Operator } from '../utils/useCalculator';

type Variant = 'num' | 'op' | 'special' | 'equals';

interface Cell {
  readonly id: string;
  readonly label: ReactNode;
  readonly variant: Variant;
  readonly onPress: () => void;
  readonly rowSpan?: number;
  readonly disabled?: boolean;
}

export interface AmountKeypadProps {
  readonly currency: string;
  readonly hasOperator: boolean;
  readonly canEquals: boolean;
  readonly disabled?: boolean;
  readonly dispatch: (a: CalculatorAction) => void;
  readonly onEquals: () => void;
  readonly onOpenDate: () => void;
  readonly onOpenCurrency: () => void;
}

export function AmountKeypad({
  currency,
  hasOperator,
  canEquals,
  disabled,
  dispatch,
  onEquals,
  onOpenDate,
  onOpenCurrency,
}: AmountKeypadProps) {
  const theme = useTheme();

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
    rowSpan: 2,
    onPress: onEquals,
    disabled: !canEquals,
  });

  const layout: ReadonlyArray<ReadonlyArray<Cell | null>> = [
    [
      digit('7'), digit('8'), digit('9'), op('\u00f7'),
      special('backspace', <MaterialIcons name="backspace" size={20} color={theme.colors.onSurfaceVariant} />, () => dispatch({ type: 'backspace' })),
    ],
    [
      digit('4'), digit('5'), digit('6'), op('\u00d7'),
      special('date', <MaterialIcons name="calendar-today" size={20} color={theme.colors.onSurfaceVariant} />, onOpenDate),
    ],
    [digit('1'), digit('2'), digit('3'), op('-', '\u2212'), equals()],
    [special('currency', currency, onOpenCurrency), digit('0'), digit('.'), op('+'), null],
  ];

  // Render via flexbox: each row is a horizontal flex; equals cell uses
  // absolute positioning to span 2 rows. Keeps RN layout simple.
  const cellGap = 6;
  const rowFlex = (rowIdx: number): ViewStyle => ({
    width: '100%' as DimensionValue,
    flexDirection: 'row',
    gap: cellGap,
    marginBottom: rowIdx === layout.length - 1 ? 0 : cellGap,
  });

  return (
    <View style={{ width: '100%' }}>
      {layout.map((row, r) => (
        <View key={`row-${r}`} style={rowFlex(r)}>
          {row.map((cell, c) => {
            if (!cell) return <View key={`empty-${r}-${c}`} style={{ flex: 1 }} />;
            const palette = cellPalette(theme, cell.variant);
            const isEquals = cell.variant === 'equals';
            const heightFactor = cell.rowSpan ?? 1;
            return (
              <Pressable
                key={cell.id}
                onPress={cell.onPress}
                disabled={disabled || cell.disabled}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 56 * heightFactor + (heightFactor > 1 ? cellGap : 0),
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  backgroundColor: pressed ? palette.bgPressed : palette.bg,
                  opacity: disabled || cell.disabled ? 0.5 : 1,
                  // Equals spans into the row below; pull a bit so it visually fills both.
                  ...(isEquals ? { marginBottom: -(56 + cellGap) } : {}),
                })}
              >
                {typeof cell.label === 'string' ? (
                  <Text
                    style={{
                      color: palette.color,
                      fontSize: cell.variant === 'equals' ? (hasOperator ? 24 : 16) : 18,
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
          })}
        </View>
      ))}
    </View>
  );
}

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
