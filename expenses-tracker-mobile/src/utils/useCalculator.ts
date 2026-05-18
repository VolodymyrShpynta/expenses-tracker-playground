/**
 * useCalculator — pure expression state for the expense keypad.
 *
 * Thin React wrapper over the pure logic in [`./calculator.ts`](./calculator.ts).
 * The split matches the `domain/exchangeRates.ts` ↔ `hooks/useExchangeRates.ts`
 * pattern: all non-React code lives in `calculator.ts` so it can be
 * exercised under Vitest in plain Node, and the hook just plumbs the
 * reducer into React's lifecycle.
 *
 * Direct port of the web frontend's `useCalculator` (no DOM-specific
 * concerns — the hook is presentation-agnostic).
 */
import { useMemo, useReducer } from 'react';
import type { Dispatch } from 'react';

import {
  evaluate,
  initialTokens,
  reducer,
  tokensToString,
  trimTrailing,
} from './calculator';
import type { CalculatorAction } from './calculator';

export { OPERATORS } from './calculator';
export type { CalculatorAction, Operator } from './calculator';

export interface UseCalculatorResult {
  readonly expression: string;
  readonly hasOperator: boolean;
  readonly amount: number | null;
  readonly dispatch: Dispatch<CalculatorAction>;
}

export function useCalculator(initialAmount?: number | null): UseCalculatorResult {
  const [tokens, dispatch] = useReducer(reducer, initialAmount, initialTokens);

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
