import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import BodyFatGoalCard from '../../src/components/BodyFatGoalCard';

const mockMutateAsync = jest.fn();
let mockTarget: string | null = '18.0';

jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { target_body_fat_percentage: mockTarget },
  }),
  useSetTargetBodyFat: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

describe('BodyFatGoalCard', () => {
  beforeEach(() => {
    mockTarget = '18.0';
    mockMutateAsync.mockReset().mockResolvedValue(undefined);
    (Toast.show as jest.Mock).mockClear();
  });

  it('shows the saved goal and the note about measuring methods', () => {
    const { getByTestId, getByText } = render(<BodyFatGoalCard />);
    expect(getByTestId('body-fat-goal-input').props.value).toBe('18');
    expect(getByText(/vary a lot between methods/)).toBeTruthy();
  });

  it('saves a typed goal, accepting a decimal comma', async () => {
    const { getByTestId } = render(<BodyFatGoalCard />);
    fireEvent.changeText(getByTestId('body-fat-goal-input'), '15,26');
    fireEvent.press(getByTestId('body-fat-goal-save'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith(15.3));
  });

  it.each(['2', '61'])('refuses %s and explains the range', (value) => {
    const { getByTestId, getByText } = render(<BodyFatGoalCard />);
    fireEvent.changeText(getByTestId('body-fat-goal-input'), value);
    expect(getByText('Enter a body fat goal from 3% to 60%.')).toBeTruthy();
    fireEvent.press(getByTestId('body-fat-goal-save'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('clears the goal', async () => {
    const { getByTestId } = render(<BodyFatGoalCard />);
    fireEvent.press(getByTestId('body-fat-goal-clear'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith(null));
  });

  it('offers no Clear without a saved goal', () => {
    mockTarget = null;
    const { queryByTestId, getByTestId } = render(<BodyFatGoalCard />);
    expect(getByTestId('body-fat-goal-input').props.value).toBe('');
    expect(queryByTestId('body-fat-goal-clear')).toBeNull();
  });
});
