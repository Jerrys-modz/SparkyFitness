import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import GoalWeightSection from '../../src/components/GoalWeightSection';
import { useProfile, useSetTargetWeight } from '../../src/hooks/useProfile';
import { usePreferences } from '../../src/hooks/usePreferences';

jest.mock('../../src/hooks/useProfile');
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

const mockSave = jest.fn().mockResolvedValue({});

beforeEach(() => {
  mockSave.mockClear();
  (useProfile as jest.Mock).mockReturnValue({
    profile: { target_weight: null },
  });
  (useSetTargetWeight as jest.Mock).mockReturnValue({
    saveTargetWeight: mockSave,
    isSaving: false,
  });
  (usePreferences as jest.Mock).mockReturnValue({
    preferences: { default_weight_unit: 'lbs' },
  });
});

describe('GoalWeightSection', () => {
  it('saves a pounds entry as kilograms', async () => {
    render(<GoalWeightSection />);
    fireEvent.changeText(screen.getByTestId('goal-weight-input'), '154.3');
    fireEvent.press(screen.getByTestId('goal-weight-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toBeCloseTo(69.99, 1);
  });

  it('clears a saved goal', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profile: { target_weight: '70.00' },
    });
    render(<GoalWeightSection />);
    fireEvent.press(screen.getByTestId('goal-weight-clear'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(null));
  });
});
