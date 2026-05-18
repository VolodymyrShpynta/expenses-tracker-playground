/**
 * Tests for `calculator.ts` — the pure expression engine that powers
 * the keypad reducer in `useCalculator`.
 *
 * Two concerns are covered separately:
 *   1. `evaluate` — produces a numeric result from a `Token[]`
 *      expression with `+`/`-`/`×`/`÷` precedence and cents rounding.
 *   2. `reducer` — state transitions for digits / operators / decimal
 *      / backspace / evaluate / reset.
 */
import { describe, expect, it } from 'vitest';

import {
  evaluate,
  initialTokens,
  reducer,
  tokensToString,
  trimTrailing,
} from './calculator';
import type { CalculatorAction, Token } from './calculator';

const TIMES: Token = { kind: 'op', value: '\u00d7' };
const DIVIDE: Token = { kind: 'op', value: '\u00f7' };
const PLUS: Token = { kind: 'op', value: '+' };
const MINUS: Token = { kind: 'op', value: '-' };

describe('evaluate', () => {
  it('should return null for an empty token list', () => {
    expect(evaluate([])).toBeNull();
  });

  it('should return the numeric value of a single-number expression', () => {
    expect(evaluate([{ kind: 'num', value: '12' }])).toBe(12);
  });

  it('should add two numbers', () => {
    expect(evaluate([{ kind: 'num', value: '12' }, PLUS, { kind: 'num', value: '3' }])).toBe(15);
  });

  it('should respect × precedence over +', () => {
    // Given: 1 + 2 × 3  →  1 + (2 × 3)  →  7
    const tokens: Token[] = [
      { kind: 'num', value: '1' },
      PLUS,
      { kind: 'num', value: '2' },
      TIMES,
      { kind: 'num', value: '3' },
    ];

    // When/Then
    expect(evaluate(tokens)).toBe(7);
  });

  it('should return null when dividing by zero (NaN propagates as null)', () => {
    expect(evaluate([{ kind: 'num', value: '1' }, DIVIDE, { kind: 'num', value: '0' }])).toBeNull();
  });

  it('should round the final result to cents', () => {
    // Given: 1 ÷ 3 = 0.3333… → rounded to 0.33
    expect(evaluate([{ kind: 'num', value: '1' }, DIVIDE, { kind: 'num', value: '3' }])).toBe(0.33);
  });

  it('should return null for an incomplete number token', () => {
    expect(evaluate([{ kind: 'num', value: '.' }])).toBeNull();
    expect(evaluate([{ kind: 'num', value: '' }])).toBeNull();
  });

  it('should ignore a trailing incomplete tail when called via trimTrailing first', () => {
    // Given: a "12 +" expression (operator left dangling)
    const tokens: Token[] = [{ kind: 'num', value: '12' }, PLUS];

    // When
    const result = evaluate(trimTrailing(tokens));

    // Then
    expect(result).toBe(12);
  });

  it('should subtract left-to-right at equal precedence', () => {
    // 10 - 3 - 2 = 5
    expect(
      evaluate([
        { kind: 'num', value: '10' },
        MINUS,
        { kind: 'num', value: '3' },
        MINUS,
        { kind: 'num', value: '2' },
      ]),
    ).toBe(5);
  });
});

describe('trimTrailing', () => {
  it('should strip trailing operator tokens', () => {
    expect(trimTrailing([{ kind: 'num', value: '12' }, PLUS])).toEqual([
      { kind: 'num', value: '12' },
    ]);
  });

  it('should strip trailing "." literal', () => {
    expect(trimTrailing([{ kind: 'num', value: '.' }])).toEqual([]);
  });
});

describe('tokensToString', () => {
  it('should render numbers verbatim and operators padded with spaces', () => {
    expect(
      tokensToString([
        { kind: 'num', value: '12' },
        PLUS,
        { kind: 'num', value: '3' },
      ]),
    ).toBe('12 + 3');
  });

  it('should render an empty token stream as the empty string', () => {
    expect(tokensToString([])).toBe('');
  });
});

describe('initialTokens', () => {
  it('should return an empty stream when no seed is passed', () => {
    expect(initialTokens()).toEqual([]);
  });

  it('should return an empty stream for null / undefined / zero / negative seeds', () => {
    expect(initialTokens(null)).toEqual([]);
    expect(initialTokens(undefined)).toEqual([]);
    expect(initialTokens(0)).toEqual([]);
    expect(initialTokens(-12)).toEqual([]);
  });

  it('should seed a single num token for a positive finite amount', () => {
    expect(initialTokens(12.5)).toEqual([{ kind: 'num', value: '12.5' }]);
  });
});

describe('reducer', () => {
  it('should append a fresh num token on the first digit', () => {
    // Given/When
    const next = reducer([], { type: 'digit', value: '1' });

    // Then
    expect(next).toEqual([{ kind: 'num', value: '1' }]);
  });

  it('should accumulate digits onto the trailing num token', () => {
    // Given: "1"
    let state: Token[] = [];
    state = reducer(state, { type: 'digit', value: '1' });
    state = reducer(state, { type: 'digit', value: '2' });
    state = reducer(state, { type: 'digit', value: '3' });

    // Then
    expect(state).toEqual([{ kind: 'num', value: '123' }]);
  });

  it('should ignore an operator action when state is empty (no leading-operator)', () => {
    // Given/When
    const next = reducer([], { type: 'operator', value: '+' });

    // Then
    expect(next).toEqual([]);
  });

  it('should replace the trailing operator when a new operator is pressed', () => {
    // Given: 12 +
    const state: Token[] = [{ kind: 'num', value: '12' }, PLUS];

    // When: user presses −
    const next = reducer(state, { type: 'operator', value: '-' });

    // Then: + was replaced with −
    expect(next).toEqual([{ kind: 'num', value: '12' }, MINUS]);
  });

  it('should append an operator after a number', () => {
    // Given
    const state: Token[] = [{ kind: 'num', value: '12' }];

    // When
    const next = reducer(state, { type: 'operator', value: '+' });

    // Then
    expect(next).toEqual([{ kind: 'num', value: '12' }, PLUS]);
  });

  it('should accept a decimal once and seed "0." when the state is empty', () => {
    // Given/When
    const next = reducer([], { type: 'decimal' });

    // Then
    expect(next).toEqual([{ kind: 'num', value: '0.' }]);
  });

  it('should refuse a second decimal in the same number token', () => {
    // Given: "0.5"
    let state: Token[] = [{ kind: 'num', value: '0.5' }];

    // When: press "."
    state = reducer(state, { type: 'decimal' });

    // Then: unchanged
    expect(state).toEqual([{ kind: 'num', value: '0.5' }]);
  });

  it('should append "." to an existing integer token', () => {
    // Given: "12"
    const state: Token[] = [{ kind: 'num', value: '12' }];

    // When
    const next = reducer(state, { type: 'decimal' });

    // Then
    expect(next).toEqual([{ kind: 'num', value: '12.' }]);
  });

  it('should backspace one digit off a multi-digit number', () => {
    // Given: "123"
    const state: Token[] = [{ kind: 'num', value: '123' }];

    // When
    const next = reducer(state, { type: 'backspace' });

    // Then
    expect(next).toEqual([{ kind: 'num', value: '12' }]);
  });

  it('should drop a single-digit number entirely on backspace', () => {
    // Given: "5"
    const state: Token[] = [{ kind: 'num', value: '5' }];

    // When
    const next = reducer(state, { type: 'backspace' });

    // Then
    expect(next).toEqual([]);
  });

  it('should drop a trailing operator on backspace', () => {
    // Given: 12 +
    const state: Token[] = [{ kind: 'num', value: '12' }, PLUS];

    // When
    const next = reducer(state, { type: 'backspace' });

    // Then
    expect(next).toEqual([{ kind: 'num', value: '12' }]);
  });

  it('should collapse the expression to a single number on evaluate', () => {
    // Given: 1 + 2 × 3
    const state: Token[] = [
      { kind: 'num', value: '1' },
      PLUS,
      { kind: 'num', value: '2' },
      TIMES,
      { kind: 'num', value: '3' },
    ];

    // When
    const next = reducer(state, { type: 'evaluate' });

    // Then
    expect(next).toEqual([{ kind: 'num', value: '7' }]);
  });

  it('should leave the state unchanged when evaluate cannot produce a result', () => {
    // Given: "."  (incomplete number, evaluates to null)
    const state: Token[] = [{ kind: 'num', value: '.' }];

    // When
    const next = reducer(state, { type: 'evaluate' });

    // Then
    expect(next).toBe(state);
  });

  it('should clear the state on reset', () => {
    // Given
    const state: Token[] = [{ kind: 'num', value: '42' }];

    // When
    const next = reducer(state, { type: 'reset' });

    // Then
    expect(next).toEqual([]);
  });

  it('should be type-safe over the discriminated CalculatorAction union (compile-time)', () => {
    // Smoke test that the union compiles — no assertion needed.
    const actions: CalculatorAction[] = [
      { type: 'digit', value: '1' },
      { type: 'operator', value: '+' },
      { type: 'decimal' },
      { type: 'backspace' },
      { type: 'evaluate' },
      { type: 'reset' },
    ];
    expect(actions).toHaveLength(6);
  });
});
