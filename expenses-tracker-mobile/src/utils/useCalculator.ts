/**
 * useCalculator — pure expression state for the expense keypad.
 *
 * Direct port of the web frontend's `useCalculator` (no DOM-specific
 * concerns — the hook is presentation-agnostic). See the web version for
 * the full reducer doc; this file is intentionally a 1:1 mirror so any
 * future change in expression semantics gets applied to both clients.
 */
import { useMemo, useReducer } from 'react';
import type { Dispatch } from 'react';

export const OPERATORS = ['+', '-', '\u00d7', '\u00f7'] as const;
export type Operator = (typeof OPERATORS)[number];

type Token =
  | { kind: 'num'; value: string }
  | { kind: 'op'; value: Operator };

const precedence = (op: Operator): number => (op === '\u00d7' || op === '\u00f7' ? 2 : 1);

const last = <T,>(arr: readonly T[]): T | undefined => arr[arr.length - 1];

const replaceTail = (tokens: readonly Token[], next: Token): Token[] =>
  [...tokens.slice(0, -1), next];

const isIncomplete = (t: Token): boolean =>
  t.kind === 'op' || t.value === '' || t.value === '.';

function parseNum(t: string): number | null {
  if (!t || t === '.') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

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
      case '\u00d7': numbers.push(a * b); break;
      case '\u00f7': numbers.push(b !== 0 ? a / b : NaN); break;
    }
  };

  for (const tok of tokens) {
    if (tok.kind === 'num') {
      const n = parseNum(tok.value);
      if (n === null) return null;
      numbers.push(n);
    } else {
      while (ops.length > 0 && precedence(ops[ops.length - 1]!) >= precedence(tok.value)) {
        apply();
      }
      ops.push(tok.value);
    }
  }
  while (ops.length > 0) apply();

  if (numbers.length !== 1 || Number.isNaN(numbers[0])) return null;
  return Math.round(numbers[0]! * 100) / 100;
}

function trimTrailing(tokens: readonly Token[]): Token[] {
  const copy = [...tokens];
  while (copy.length > 0 && isIncomplete(copy[copy.length - 1]!)) copy.pop();
  return copy;
}

function tokensToString(tokens: readonly Token[]): string {
  return tokens.map((t) => (t.kind === 'op' ? ` ${t.value} ` : t.value)).join('');
}

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
      if (!tail) return state;
      return tail.kind === 'op'
        ? replaceTail(state, { kind: 'op', value: action.value })
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

export interface UseCalculatorResult {
  readonly expression: string;
  readonly hasOperator: boolean;
  readonly amount: number | null;
  readonly dispatch: Dispatch<CalculatorAction>;
}

export function useCalculator(initialAmount?: number | null): UseCalculatorResult {
  const [tokens, dispatch] = useReducer(
    reducer,
    initialAmount,
    (seed): Token[] =>
      seed != null && Number.isFinite(seed) && seed > 0
        ? [{ kind: 'num', value: String(seed) }]
        : [],
  );

  return useMemo(
    () => ({
      expression: tokensToString(tokens),
      hasOperator: tokens.some((t) => t.kind === 'op'),
      amount: evaluate(trimTrailing(tokens)),
      dispatch,
    }),
    [tokens],
  );
}
