import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalculationSettings from '@/pages/Settings/CalculationSettings';

const mockSave = jest.fn();
const mockPreferences = {
  energyUnit: 'kcal',
  weightUnit: 'kg',
  timezone: 'UTC',
  loggingLevel: 'ERROR',
  goalMode: 'weekly',
  goalModeWeeklyChangeKg: -2,
  goalModeCalculationMethod: 'manual',
  goalModeCustomPercentage: 0,
  calorieGoalAdjustmentMode: 'fixed',
  calorieSafetyFloorMode: 'standard',
  calorieSafetyFloorValue: 1200,
  saveAllPreferences: mockSave,
  setEnergyUnit: jest.fn(),
  convertEnergy: (value: number) => value,
  convertWeight: (value: number) => value,
  getEnergyUnitString: () => 'kcal',
};

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => mockPreferences,
}));
jest.mock('@/hooks/useInvalidateKeys', () => ({
  useDiaryInvalidation: () => jest.fn(),
  useDailyProgressInvalidation: () => jest.fn(),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: { gender: 'male' } }),
}));
jest.mock('@/hooks/Diary/useDailyProgress', () => ({
  useCalculatedBMR: () => ({ bmr: 1600, weight: 70, height: 170 }),
  useAdaptiveTdee: () => ({ data: undefined }),
  useMostRecentBodyFatQuery: () => ({ data: undefined }),
}));
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useDiaryGoals: () => ({ data: { calories: 2000 } }),
}));
jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useMostRecentMeasurement: () => ({ data: undefined }),
}));

describe('CalculationSettings weekly goal', () => {
  beforeEach(() => {
    mockSave.mockClear();
    mockPreferences.calorieGoalAdjustmentMode = 'fixed';
  });

  it('shows the additive weekly adjustment in the device projection formula', () => {
    mockPreferences.calorieGoalAdjustmentMode = 'tdee';
    render(<CalculationSettings />);
    expect(
      screen.getByText('Projected TDEE + Weekly adjustment − Eaten')
    ).toBeInTheDocument();
    expect(screen.queryByText('Projected TDEE × Goal Mode − Eaten')).toBeNull();
  });

  it('explains the weekly safety floor without claiming the manual baseline bypasses it', () => {
    render(<CalculationSettings />);
    expect(
      screen.getByText(/which is below your .*target has been raised/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /The Manual calculation method does not apply this floor/
      )
    ).toBeNull();
    expect(
      screen.getByText(
        /Weekly weight targets use your configured safety floor with either calculation method/
      )
    ).toBeInTheDocument();
  });

  it('disables saving for a blank weekly amount and allows a valid comma decimal', () => {
    render(<CalculationSettings />);
    const amount = screen.getByRole('textbox', { name: 'Weekly amount' });
    const save = screen.getByRole('button', { name: 'Save Preferences' });
    fireEvent.change(amount, { target: { value: '' } });
    expect(save).toBeDisabled();
    fireEvent.change(amount, { target: { value: '0,5' } });
    expect(save).toBeEnabled();
  });
});
