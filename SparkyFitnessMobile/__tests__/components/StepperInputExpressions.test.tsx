import React, { useState } from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import StepperInput from '../../src/components/StepperInput';
import { initializeI18n } from '../../src/localization/i18n';
import {
  QUANTITY_INPUT_REGEX,
  parseQuantityInput,
} from '../../src/utils/quantityExpression';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

beforeAll(async () => {
  await initializeI18n();
});

function Harness({
  initial,
  onBlurSpy,
  allowExpressions = true,
}: {
  initial: string;
  onBlurSpy?: jest.Mock;
  allowExpressions?: boolean;
}) {
  const [text, setText] = useState(initial);
  return (
    <StepperInput
      value={text}
      onChangeText={(next) => {
        if (QUANTITY_INPUT_REGEX.test(next)) setText(next);
      }}
      onBlur={onBlurSpy}
      onIncrement={() => setText(String(parseQuantityInput(text) + 1))}
      onDecrement={() => setText(String(parseQuantityInput(text) - 1))}
      allowExpressions={allowExpressions}
      accessibilityLabels={{ input: 'Quantity' }}
    />
  );
}

describe('StepperInput allowExpressions', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('shows the evaluated result while an expression is typed', () => {
    const { getByLabelText, getByText } = render(<Harness initial="1" />);
    fireEvent.changeText(getByLabelText('Quantity'), '2*3');
    expect(getByText('= 6')).toBeTruthy();
  });

  it('shows nothing extra for a plain number', () => {
    const { queryByText } = render(<Harness initial="2.5" />);
    expect(queryByText(/^=/)).toBeNull();
    expect(queryByText(/valid calculation/)).toBeNull();
  });

  it('replaces a valid expression with its result on blur, then calls onBlur', () => {
    const onBlur = jest.fn();
    const { getByLabelText } = render(
      <Harness initial="1" onBlurSpy={onBlur} />
    );
    const input = getByLabelText('Quantity');
    fireEvent.changeText(input, '1/2');
    fireEvent(input, 'blur');
    expect(input.props.value).toBe('0.5');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('keeps an invalid expression, shows the error and skips onBlur', () => {
    const onBlur = jest.fn();
    const { getByLabelText, getByText } = render(
      <Harness initial="1" onBlurSpy={onBlur} />
    );
    const input = getByLabelText('Quantity');
    fireEvent.changeText(input, '2*');
    expect(getByText(/valid calculation/)).toBeTruthy();
    fireEvent(input, 'blur');
    expect(input.props.value).toBe('2*');
    expect(onBlur).not.toHaveBeenCalled();
  });

  it('reports division by zero as invalid', () => {
    const { getByLabelText, getByText } = render(<Harness initial="1" />);
    fireEvent.changeText(getByLabelText('Quantity'), '1/0');
    expect(getByText(/valid calculation/)).toBeTruthy();
  });

  it('caps the field length', () => {
    const { getByLabelText } = render(<Harness initial="1" />);
    expect(getByLabelText('Quantity').props.maxLength).toBe(64);
  });

  it('uses the punctuation keyboard on iOS and the default one on Android', () => {
    Platform.OS = 'ios';
    const ios = render(<Harness initial="1" />);
    expect(ios.getByLabelText('Quantity').props.keyboardType).toBe(
      'numbers-and-punctuation'
    );
    ios.unmount();
    Platform.OS = 'android';
    const android = render(<Harness initial="1" />);
    expect(android.getByLabelText('Quantity').props.keyboardType).toBe(
      'default'
    );
  });

  it('leaves the field unchanged when the option is off', () => {
    const onBlur = jest.fn();
    const { getByLabelText, queryByText } = render(
      <Harness initial="1" onBlurSpy={onBlur} allowExpressions={false} />
    );
    const input = getByLabelText('Quantity');
    fireEvent.changeText(input, '2*3');
    expect(queryByText('= 6')).toBeNull();
    expect(input.props.keyboardType).toBe('decimal-pad');
    expect(input.props.maxLength).toBeUndefined();
    fireEvent(input, 'blur');
    expect(input.props.value).toBe('2*3');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
