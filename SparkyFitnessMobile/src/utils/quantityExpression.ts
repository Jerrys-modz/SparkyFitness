import { evaluateArithmetic } from '@workspace/shared';
import { parseDecimalInput } from './numericInput';

/**
 * Characters a quantity field accepts: digits, decimal and grouping
 * separators, whitespace, parentheses and `+ - * /`. Like
 * `DECIMAL_INPUT_REGEX` this only filters keystrokes; structure is validated
 * by {@link describeQuantityInput}.
 */
export const QUANTITY_INPUT_REGEX = /^[\d.,\s  +\-*/()]*$/;

/** Longest text a quantity field holds; longer text is invalid, plain or not. */
export const QUANTITY_INPUT_MAX_LENGTH = 64;

const EXPRESSION_CHARS = /[+\-*/()]/;

export type QuantityInputState =
  | { kind: 'empty' }
  | { kind: 'number'; value: number }
  | { kind: 'expression'; value: number }
  | { kind: 'invalid' };

/**
 * Classifies a quantity field's text. A plain number goes through
 * `parseDecimalInput` so locale grouping (`1.234,5`) keeps working; anything
 * with an operator or parenthesis goes through the shared evaluator, which
 * never executes code. A negative result is invalid: quantities are positive.
 */
export function describeQuantityInput(
  text: string | null | undefined
): QuantityInputState {
  if (text == null || text.trim() === '') return { kind: 'empty' };
  if (text.length > QUANTITY_INPUT_MAX_LENGTH) return { kind: 'invalid' };
  const plain = parseDecimalInput(text);
  if (!Number.isNaN(plain)) return { kind: 'number', value: plain };
  if (!EXPRESSION_CHARS.test(text)) return { kind: 'invalid' };
  const value = evaluateArithmetic(text);
  if (value === undefined || value < 0) return { kind: 'invalid' };
  return { kind: 'expression', value };
}

/** Value to save for the field's text, or `NaN` when it is not a quantity. */
export function parseQuantityInput(text: string | null | undefined): number {
  const state = describeQuantityInput(text);
  return state.kind === 'number' || state.kind === 'expression'
    ? state.value
    : NaN;
}

/** Stored form of an evaluated expression: at most three decimals. */
export function formatQuantityResult(value: number): string {
  return String(Number(value.toFixed(3)));
}
