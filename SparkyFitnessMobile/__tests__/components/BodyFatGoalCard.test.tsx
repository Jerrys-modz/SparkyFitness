import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import BodyFatGoalCard from '../../src/components/BodyFatGoalCard';

describe('BodyFatGoalCard', () => {
  it('shows the value, the method note and how to clear, with no save button of its own', () => {
    const { getByTestId, getByText, queryByText } = render(
      <BodyFatGoalCard value="18" onChange={jest.fn()} invalid={false} />
    );
    expect(getByTestId('body-fat-goal-input').props.value).toBe('18');
    expect(getByText(/vary a lot between methods/)).toBeTruthy();
    expect(
      getByText('Leave it empty and save to remove the goal.')
    ).toBeTruthy();
    expect(queryByText(/Save body fat goal/)).toBeNull();
    expect(queryByText('Clear')).toBeNull();
  });

  it('reports typing to the screen', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <BodyFatGoalCard value="" onChange={onChange} invalid={false} />
    );
    fireEvent.changeText(getByTestId('body-fat-goal-input'), '15,5');
    expect(onChange).toHaveBeenCalledWith('15,5');
  });

  it('explains the range when the value is invalid', () => {
    const { getByText, queryByTestId, rerender } = render(
      <BodyFatGoalCard value="2" onChange={jest.fn()} invalid />
    );
    expect(getByText('Enter a body fat goal from 3% to 60%.')).toBeTruthy();
    rerender(
      <BodyFatGoalCard value="20" onChange={jest.fn()} invalid={false} />
    );
    expect(queryByTestId('body-fat-goal-error')).toBeNull();
  });
});
