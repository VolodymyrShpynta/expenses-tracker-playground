/**
 * AmountKeypad — presentational 5×4 grid that drives a {@link useCalculator} reducer.
 *
 * Grid layout:
 *
 *   ┌─────┬─────┬─────┬─────┬───────────┐
 *   │  7  │  8  │  9  │  ÷  │ backspace │
 *   ├─────┼─────┼─────┼─────┼───────────┤
 *   │  4  │  5  │  6  │  ×  │ calendar  │
 *   ├─────┼─────┼─────┼─────┼───────────┤
 *   │  1  │  2  │  3  │  −  │           │
 *   ├─────┼─────┼─────┼─────┤  = / OK   │  ← spans 2 rows
 *   │ CCY │  0  │  .  │  +  │           │
 *   └─────┴─────┴─────┴─────┴───────────┘
 *
 * Cells are built via small factories (`digit`, `op`, `special`, `equals`) and
 * styled by `variant` (`num` | `op` | `special` | `equals`).
 *
 * Equals cell: label toggles between `=` (evaluate expression) and `OK` (submit)
 * based on `hasOperator`; disabled when `canEquals` is false (empty expression).
 *
 * Keyboard binding (desktop only, `bindKeyboard`):
 *   - Digits/`.`/`,` → digit/decimal actions.
 *   - `+ - * /` (and `× ÷`) → operator actions.
 *   - `Backspace` → backspace.
 *   - `Enter` / `=` → triggers `onEquals` (when enabled).
 *   - Ignored while the user is typing into an input/textarea or with modifier keys.
 *
 * The handler is kept in a ref refreshed via `useLayoutEffect` so prop changes
 * (e.g. `canEquals`) take effect without re-binding the window listener.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useTheme, alpha, type Theme } from '@mui/material/styles';
import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import type { ReactNode } from 'react';
import type { CalculatorAction, Operator } from './useCalculator';

// ---------------------------------------------------------------------------
// Cell model
// ---------------------------------------------------------------------------

type Variant = 'num' | 'op' | 'special' | 'equals';

interface Cell {
  id: string;
  label: ReactNode;
  variant: Variant;
  onClick: () => void;
  rowSpan?: number;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Keyboard mapping
// ---------------------------------------------------------------------------

const KEY_TO_OPERATOR: Readonly<Record<string, Operator>> = {
  '+': '+',
  '-': '-',
  '*': '×',
  '×': '×',
  '/': '÷',
  '÷': '÷',
};

/** Special marker for Enter/= keys — triggers the caller's `onEquals` handler. */
type KeyResult = CalculatorAction | 'equals' | null;

function keyToAction(key: string): KeyResult {
  if (/^\d$/.test(key)) return { type: 'digit', value: key };
  if (key === '.' || key === ',') return { type: 'decimal' };
  if (KEY_TO_OPERATOR[key]) return { type: 'operator', value: KEY_TO_OPERATOR[key] };
  if (key === 'Backspace') return { type: 'backspace' };
  if (key === 'Enter' || key === '=') return 'equals';
  return null;
}

function isTypingIntoField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

// ---------------------------------------------------------------------------
// Styling helpers
// ---------------------------------------------------------------------------

interface CellColors {
  bg: string;
  bgHover: string;
  color: string;
}

function cellColors(theme: Theme, variant: Variant): CellColors {
  const opColor = theme.palette.success.main;
  const numBg = alpha(theme.palette.text.primary, 0.04);
  const numBgHover = alpha(theme.palette.text.primary, 0.1);
  const opBg = alpha(opColor, 0.08);
  const opBgHover = alpha(opColor, 0.16);

  switch (variant) {
    case 'equals':
      return { bg: opColor, bgHover: theme.palette.success.dark, color: theme.palette.common.white };
    case 'op':
      return { bg: opBg, bgHover: opBgHover, color: opColor };
    case 'num':
    case 'special':
      return { bg: numBg, bgHover: numBgHover, color: theme.palette.text.primary };
  }
}

function cellFontSize(variant: Variant, hasOperator: boolean): string {
  if (variant === 'equals') return hasOperator ? '1.6rem' : '1.1rem';
  return '1.25rem';
}

// ---------------------------------------------------------------------------
// AmountKeypad
// ---------------------------------------------------------------------------

export interface AmountKeypadProps {
  currency: string;
  hasOperator: boolean;
  /** When false, the equals/OK button is disabled (e.g. empty expression). */
  canEquals: boolean;
  disabled?: boolean;
  /** When true, physical keyboard input is bound to the same actions (desktop). */
  bindKeyboard?: boolean;
  dispatch: (action: CalculatorAction) => void;
  onEquals: () => void;
  onOpenDate: () => void;
  onOpenCurrency: () => void;
}

export function AmountKeypad({
  currency,
  hasOperator,
  canEquals,
  disabled,
  bindKeyboard,
  dispatch,
  onEquals,
  onOpenDate,
  onOpenCurrency,
}: AmountKeypadProps) {
  const theme = useTheme();

  // --- Cell builders ------------------------------------------------------
  const digit = (d: string): Cell => ({
    id: d,
    label: d,
    variant: 'num',
    onClick: () => dispatch(d === '.' ? { type: 'decimal' } : { type: 'digit', value: d }),
  });

  const op = (o: Operator, label: ReactNode = o): Cell => ({
    id: o,
    label,
    variant: 'op',
    onClick: () => dispatch({ type: 'operator', value: o }),
  });

  const special = (id: string, label: ReactNode, onClick: () => void): Cell => ({
    id, label, variant: 'special', onClick,
  });

  const equals = (): Cell => ({
    id: 'equals',
    label: hasOperator ? '=' : 'OK',
    variant: 'equals',
    rowSpan: 2,
    onClick: onEquals,
    disabled: !canEquals,
  });

  const backspaceIcon = <BackspaceOutlinedIcon fontSize="small" />;
  const calendarIcon = <CalendarMonthIcon fontSize="small" />;

  // --- Layout (5 × 4 grid; null = cell above spans into this slot) -------
  const layout: Array<Array<Cell | null>> = [
    [digit('7'), digit('8'), digit('9'), op('÷'), special('backspace', backspaceIcon, () => dispatch({ type: 'backspace' }))],
    [digit('4'), digit('5'), digit('6'), op('×'), special('date', calendarIcon, onOpenDate)],
    [digit('1'), digit('2'), digit('3'), op('-', '−'), equals()],
    [special('currency', currency, onOpenCurrency), digit('0'), digit('.'), op('+'), null],
  ];

  // --- Desktop keyboard support ------------------------------------------
  // Store the latest handler in a ref so the effect doesn't re-bind on every keystroke.
  const handlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    handlerRef.current = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingIntoField(e.target)) return;
      const result = keyToAction(e.key);
      if (!result) return;
      e.preventDefault();
      if (result === 'equals') {
        if (canEquals) onEquals();
      } else {
        dispatch(result);
      }
    };
  });

  useEffect(() => {
    if (!bindKeyboard || disabled) return;
    const onKey = (e: KeyboardEvent) => handlerRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindKeyboard, disabled]);

  // --- Render -------------------------------------------------------------
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gridTemplateRows: 'repeat(4, 1fr)',
        gap: 0.75,
      }}
    >
      {layout.flatMap((row, r) =>
        row.map((cell, c) => cell && (
          <ButtonBase
            key={cell.id}
            onClick={cell.onClick}
            disabled={disabled || cell.disabled}
            sx={buildCellSx(cell, r, c, hasOperator, theme)}
          >
            {cell.label}
          </ButtonBase>
        )),
      )}
    </Box>
  );
}

function buildCellSx(cell: Cell, row: number, col: number, hasOperator: boolean, theme: Theme) {
  const colors = cellColors(theme, cell.variant);
  const isHeavy = cell.variant === 'equals' || cell.variant === 'op';
  return {
    gridRow: cell.rowSpan ? `${row + 1} / span ${cell.rowSpan}` : `${row + 1}`,
    gridColumn: `${col + 1}`,
    borderRadius: 2,
    minHeight: { xs: 48, sm: 56 },
    fontSize: cellFontSize(cell.variant, hasOperator),
    fontWeight: isHeavy ? 700 : 500,
    bgcolor: colors.bg,
    color: colors.color,
    '&:hover': { bgcolor: colors.bgHover },
    '&:disabled': { opacity: 0.6 },
  };
}
