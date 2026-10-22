import {
  QUANTITY_INPUT_REGEX,
  describeQuantityInput,
  formatQuantityResult,
  parseQuantityInput,
} from '../../src/utils/quantityExpression';

describe('parseQuantityInput', () => {
  it.each([
    ['2', 2],
    ['1,5', 1.5],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['2*3', 6],
    ['1/2', 0.5],
    ['1/3', 1 / 3],
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['20/2/5', 2],
    ['10-3-2', 5],
    [' 1,5 * 2 ', 3],
    ['1,5*2', 3],
    ['(1/2)+(1/4)', 0.75],
    ['0*5', 0],
  ])('evaluates %s', (text, expected) => {
    expect(parseQuantityInput(text)).toBeCloseTo(expected);
  });

  it.each([
    '',
    '   ',
    '2*',
    '*2',
    '(2+3',
    '2+3)',
    '2(3)',
    '1..5',
    '1,2,3',
    '1/0',
    '0/0',
    '1e309',
    '1e308*10',
    '-2',
    '1-3',
    '2**3',
    '2//3',
    'abc',
    'Math.random()',
    'alert(1)',
    '2;3',
    '0x10',
    'NaN',
    'Infinity',
    '1'.repeat(201),
    `${'('.repeat(150)}1${')'.repeat(150)}`,
    `1${'+1'.repeat(150)}`,
  ])('rejects %s', (text) => {
    expect(parseQuantityInput(text)).toBeNaN();
  });

  it('returns NaN for nullish input', () => {
    expect(parseQuantityInput(null)).toBeNaN();
    expect(parseQuantityInput(undefined)).toBeNaN();
  });
});

describe('describeQuantityInput', () => {
  it('classifies empty, plain, expression and invalid text', () => {
    expect(describeQuantityInput('')).toEqual({ kind: 'empty' });
    expect(describeQuantityInput('2.5')).toEqual({
      kind: 'number',
      value: 2.5,
    });
    expect(describeQuantityInput('2*3')).toEqual({
      kind: 'expression',
      value: 6,
    });
    expect(describeQuantityInput('2*')).toEqual({ kind: 'invalid' });
    expect(describeQuantityInput('1..5')).toEqual({ kind: 'invalid' });
  });

  it('treats a negative result as invalid', () => {
    expect(describeQuantityInput('1-3')).toEqual({ kind: 'invalid' });
  });
});

describe('formatQuantityResult', () => {
  it('rounds to three decimals without trailing zeros', () => {
    expect(formatQuantityResult(6)).toBe('6');
    expect(formatQuantityResult(1 / 3)).toBe('0.333');
    expect(formatQuantityResult(0.5)).toBe('0.5');
  });
});

describe('QUANTITY_INPUT_REGEX', () => {
  it('accepts numbers and operators and rejects letters', () => {
    expect(QUANTITY_INPUT_REGEX.test('1,5 * (2+3)/4')).toBe(true);
    expect(QUANTITY_INPUT_REGEX.test('1e5')).toBe(false);
    expect(QUANTITY_INPUT_REGEX.test('alert(1)')).toBe(false);
  });
});
