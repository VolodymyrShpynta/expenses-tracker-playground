/**
 * Pure calculator expression engine — no React, no DOM. The keypad hook
 * (`useCalculator`) is a thin reducer wrapper over the functions here.
 *
 * Direct port of the web frontend's calculator logic. Kept in its own
 * module (not co-located with the hook) so:
 *   - Vitest can exercise the reducer + evaluator without any React
 *     imports (matches the `domain/exchangeRates.ts` ↔
 *     `hooks/useExchangeRates.ts` split).
 *   - Future divergence between mobile and web keypad semantics is
 *     surfaced as a failing unit test, not as production drift.
 *
 * Expression model: a flat `Token[]` alternating numeric literals and
 * binary operators. The evaluator is a small Shunting-Yard-style stack
 * machine that honours `×`/`÷` over `+`/`-` precedence and rounds the
 * final result to 2 decimals (cents resolution).
 */
export const OPERATORS = ['+', '-', '\u00d7', '\u00f7'] as const;
export type Operator = (typeof OPERATORS)[number];

export type Token =
  | { kind: 'num'; value: string }
  | { kind: 'op'; value: Operator };

const precedence = (op: Operator): number =>
  op === '\u00d7' || op === '\u00f7' ? 2 : 1;

const last = <T,>(arr: readonly T[]): T | undefined => arr[arr.length - 1];

const replaceTail = (tokens: readonly Token[], next: Token): Token[] => [
  ...tokens.slice(0, -1),
  next,
];

const isIncomplete = (t: Token): boolean =>
  t.kind === 'op' || t.value === '' || t.value === '.';

function parseNum(t: string): number | null {
  if (!t || t === '.') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function evaluate(tokens: readonly Token[]): number | null {
  if (tokens.length === 0) return null;

  const numbers: number[] = [];
  const ops: Operator[] = [];

  const apply = (): void => {
    const b = numbers.pop()!;
    const a = numbers.pop()!;
    const op = ops.pop()!;
    switch (op) {
      case '+':
        numbers.push(a + b);
        break;
      case '-':
        numbers.push(a - b);
        break;
      case '\u00d7':
        numbers.push(a * b);
        break;
      case '\u00f7':
        numbers.push(b !== 0 ? a / b : NaN);
        break;
    }
  };

  for (const tok of tokens) {
    if (tok.kind === 'num') {
      const n = parseNum(tok.value);
      if (n === null) return null;
      numbers.push(n);
    } else {
      while (
        ops.length > 0 &&
        precedence(ops[ops.length - 1]!) >= precedence(tok.value)
      ) {
        apply();
      }
      ops.push(tok.value);
    }
  }
  while (ops.length > 0) apply();

  if (numbers.length !== 1 || Number.isNaN(numbers[0])) return null;
  return Math.round(numbers[0]! * 100) / 100;
}

export function trimTrailing(tokens: readonly Token[]): Token[] {
  const copy = [...tokens];
  while (copy.length > 0 && isIncomplete(copy[copy.length - 1]!)) copy.pop();
  return copy;
}

export function tokensToString(tokens: readonly Token[]): string {
  return tokens
    .map((t) => (t.kind === 'op' ? ` ${t.value} ` : t.value))
    .join('');
}

export type CalculatorAction =
  | { type: 'digit'; value: string }
  | { type: 'operator'; value: Operator }
  | { type: 'decimal' }
  | { type: 'backspace' }
  | { type: 'evaluate' }
  | { type: 'reset' };

export function reducer(state: Token[], action: CalculatorAction): Token[] {
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

/**
 * Initial token stream when the hook is seeded with an existing amount
 * (e.g. when editing an expense). A non-positive / non-finite seed
 * yields an empty stream — equivalent to a fresh "0" entry.
 */
export function initialTokens(initialAmount?: number | null): Token[] {
  return initialAmount != null && Number.isFinite(initialAmount) && initialAmount > 0
    ? [{ kind: 'num', value: String(initialAmount) }]
    : [];
}
