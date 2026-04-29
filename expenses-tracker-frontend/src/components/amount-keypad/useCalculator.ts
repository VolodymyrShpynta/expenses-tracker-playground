/**
 * useCalculator — pure expression state for the expense keypad.
 *
 * Model: the expression is a list of tokens, each either a number-in-progress
 * (`{ kind: 'num', value: '12.5' }`) or an operator (`+ - × ÷`). A reducer
 * applies keypad/keyboard actions:
 *
 *   - `digit`     appends to the trailing num token, or starts a new one.
 *   - `decimal`   adds `.` to the trailing num, or starts `"0."` after an operator.
 *   - `operator`  appends an op; if the tail is already an op, it is *replaced*
 *                 (so tapping `+` then `-` yields `-`, not `+-`).
 *   - `backspace` drops the last character of the trailing num, or the trailing op.
 *   - `evaluate`  trims dangling ops/dots, evaluates with standard precedence
 *                 (`× ÷` before `+ -`), and collapses the result into a single
 *                 num token so the user can continue typing from the result.
 *   - `reset`     clears everything.
 *
 * The hook exposes a memoized derived view:
 *   - `expression`  display string with spaces around operators (`"2 + 3 × 4"`).
 *   - `hasOperator` drives the dual-purpose `=` / `OK` button in the keypad.
 *   - `amount`      final numeric value (rounded to 2 decimals) or `null` when
 *                   the expression is empty/incomplete; `null`/NaN short-circuits
 *                   submission in the dialog.
 *   - `dispatch`    reducer dispatch, consumed by {@link AmountKeypad}.
 */
import { useMemo, useReducer } from 'react';
import type { Dispatch } from 'react';

// ---------------------------------------------------------------------------
// Token model
// ---------------------------------------------------------------------------

export const OPERATORS = ['+', '-', '×', '÷'] as const;
export type Operator = typeof OPERATORS[number];

type Token =
  | { kind: 'num'; value: string } // digit string like "12.5" (may end with "." mid-typing)
  | { kind: 'op'; value: Operator };

const precedence = (op: Operator): number => (op === '×' || op === '÷' ? 2 : 1);

const last = <T,>(arr: readonly T[]): T | undefined => arr[arr.length - 1];

const replaceTail = (tokens: readonly Token[], next: Token): Token[] =>
  [...tokens.slice(0, -1), next];

const isIncomplete = (t: Token): boolean =>
  t.kind === 'op' || t.value === '' || t.value === '.';

/** Numeric value of a number token, or null if it's not yet a valid number. */
function parseNum(t: string): number | null {
  if (!t || t === '.') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Evaluate tokens with operator precedence. Returns null for empty/invalid input. */
function evaluate(tokens: readonly Token[]): number | null {
  if (tokens.length === 0) return null;

  const numbers: number[] = [];
  const ops: Operator[] = [];

  const apply = (): void => {
    const b = numbers.pop()!;
    const a = numbers.pop()!;
    const op = ops.pop()!;
    switch (op) {
      case '+': numbers.push(a + b); break;
      case '-': numbers.push(a - b); break;
      case '×': numbers.push(a * b); break;
      case '÷': numbers.push(b !== 0 ? a / b : NaN); break;
    }
  };

  for (const tok of tokens) {
    if (tok.kind === 'num') {
      const n = parseNum(tok.value);
      if (n === null) return null;
      numbers.push(n);
    } else {
      while (ops.length > 0 && precedence(ops[ops.length - 1]) >= precedence(tok.value)) {
        apply();
      }
      ops.push(tok.value);
    }
  }
  while (ops.length > 0) apply();

  if (numbers.length !== 1 || Number.isNaN(numbers[0])) return null;
  return Math.round(numbers[0] * 100) / 100;
}

/** Strip trailing operators and dangling dots so the expression can be evaluated. */
function trimTrailing(tokens: readonly Token[]): Token[] {
  const copy = [...tokens];
  while (copy.length > 0 && isIncomplete(copy[copy.length - 1])) copy.pop();
  return copy;
}

/** Render tokens for display: spaces around operators (`2 + 3`). */
function tokensToString(tokens: readonly Token[]): string {
  return tokens.map((t) => (t.kind === 'op' ? ` ${t.value} ` : t.value)).join('');
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type CalculatorAction =
  | { type: 'digit'; value: string }
  | { type: 'operator'; value: Operator }
  | { type: 'decimal' }
  | { type: 'backspace' }
  | { type: 'evaluate' }
  | { type: 'reset' };

function reducer(state: Token[], action: CalculatorAction): Token[] {
  const tail = last(state);

  switch (action.type) {
    case 'digit':
      return tail?.kind === 'num'
        ? replaceTail(state, { kind: 'num', value: tail.value + action.value })
        : [...state, { kind: 'num', value: action.value }];

    case 'operator':
      if (!tail) return state; // no operator as the first token
      return tail.kind === 'op'
        ? replaceTail(state, { kind: 'op', value: action.value }) // replace, don't stack
        : [...state, { kind: 'op', value: action.value }];

    case 'decimal':
      if (tail?.kind === 'num') {
        if (tail.value.includes('.')) return state;
        return replaceTail(state, { kind: 'num', value: tail.value + '.' });
      }
      return [...state, { kind: 'num', value: '0.' }];

    case 'backspace':
      if (!tail) return state;
      if (tail.kind === 'op' || tail.value.length <= 1) return state.slice(0, -1);
      return replaceTail(state, { kind: 'num', value: tail.value.slice(0, -1) });

    case 'evaluate': {
      const result = evaluate(trimTrailing(state));
      return result === null ? state : [{ kind: 'num', value: String(result) }];
    }

    case 'reset':
      return [];
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCalculatorResult {
  /** Display string of the current expression (e.g. `"2 + 3 × 4"`). */
  expression: string;
  /** True when the expression contains at least one operator. */
  hasOperator: boolean;
  /** Final numeric amount of the expression, or null if empty/incomplete. */
  amount: number | null;
  dispatch: Dispatch<CalculatorAction>;
}

export function useCalculator(initialAmount?: number | null): UseCalculatorResult {
  const [tokens, dispatch] = useReducer(
    reducer,
    initialAmount,
    (seed): Token[] => (seed != null && Number.isFinite(seed) && seed > 0
      ? [{ kind: 'num', value: String(seed) }]
      : []),
  );

  return useMemo(() => ({
    expression: tokensToString(tokens),
    hasOperator: tokens.some((t) => t.kind === 'op'),
    amount: evaluate(trimTrailing(tokens)),
    dispatch,
  }), [tokens]);
}
