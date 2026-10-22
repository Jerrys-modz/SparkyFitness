import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    mockPreferences.weightUnit = 'kg';
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

  it('keeps the percentage exercise earn-back formula after merging weekly goals', () => {
    mockPreferences.calorieGoalAdjustmentMode = 'percentage';
    render(<CalculationSettings />);
    expect(
      screen.getByText('Daily Goal - (Eaten - 100% of Exercise Burned)')
    ).toBeInTheDocument();
  });

  it('uses the profile pounds unit and saves the edited weekly rate as signed kilograms', async () => {
    mockPreferences.weightUnit = 'lbs';
    render(<CalculationSettings />);
    expect(
      screen.getByRole('combobox', { name: 'Weekly amount unit' })
    ).toHaveTextContent('lbs / week');
    fireEvent.change(screen.getByRole('textbox', { name: 'Weekly amount' }), {
      target: { value: '1.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ goalModeWeeklyChangeKg: -0.68 })
      )
    );
  });

  it('saves the exact kilogram rate after changing only its display unit', async () => {
    render(<CalculationSettings />);
    fireEvent.keyDown(
      screen.getByRole('combobox', { name: 'Weekly amount unit' }),
      {
        key: 'ArrowDown',
      }
    );
    fireEvent.click(screen.getByRole('option', { name: 'lbs / week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ goalModeWeeklyChangeKg: -2 })
      )
    );
  });
});
