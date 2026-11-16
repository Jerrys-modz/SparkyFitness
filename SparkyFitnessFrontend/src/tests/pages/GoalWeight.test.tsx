import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GoalWeight } from '@/pages/Goals/GoalWeight';

const mutateAsync = jest.fn();
let weightUnit = 'kg';
let targetWeight: string | null = '80.00';
let targetWeightDate: string | null = null;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      arg?: string | { defaultValue?: string; unit?: string; max?: number }
    ) =>
      typeof arg === 'string'
        ? arg
        : (arg?.defaultValue ?? '')
            .replace('{{unit}}', arg?.unit ?? '')
            .replace('{{max}}', String(arg?.max ?? '')),
  }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit, timezone: 'UTC' }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({
    data: { target_weight: targetWeight, target_weight_date: targetWeightDate },
  }),
}));
jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useSetTargetWeight: () => ({ mutateAsync, isPending: false }),
  useGoalWeightPlan: () => ({ data: undefined }),
}));
jest.mock('@/pages/Goals/GoalWeightPlanPanel', () => ({
  GoalWeightPlanPanel: () => null,
}));

describe('GoalWeight', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
    weightUnit = 'kg';
    targetWeight = '80.00';
    targetWeightDate = null;
  });

  it('shows the saved goal in kg', () => {
    render(<GoalWeight />);
    expect(screen.getByLabelText('Goal weight (kg)')).toHaveValue(80);
  });

  it('shows the saved goal in pounds for lbs users', () => {
    weightUnit = 'lbs';
    render(<GoalWeight />);
    expect(screen.getByLabelText('Goal weight (lbs)')).toHaveValue(176.4);
  });

  it('saves the entered pounds as kilograms', async () => {
    weightUnit = 'lbs';
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (lbs)'), {
      target: { value: '180' },
    });
    fireEvent.click(screen.getByText('Save goal weight'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0].targetWeightKg).toBeCloseTo(81.65, 2);
  });

  it('does not save an empty or non-positive value', () => {
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (kg)'), {
      target: { value: '0' },
    });
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
  });

  it('rejects a weight the server would round down to zero', () => {
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (kg)'), {
      target: { value: '0.004' },
    });
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
    expect(
      screen.getByText('Enter a weight above zero and up to 999.99 kg.')
    ).toBeInTheDocument();
  });

  it('clears the goal with null', async () => {
    render(<GoalWeight />);
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ targetWeightKg: null })
    );
  });

  it('keeps Save off until the field is edited, so a rounded value is not resubmitted', () => {
    targetWeight = '80.02';
    render(<GoalWeight />);
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
  });

  it('does not save above the server limit', () => {
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (kg)'), {
      target: { value: '1000' },
    });
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
    expect(
      screen.getByText('Enter a weight above zero and up to 999.99 kg.')
    ).toBeInTheDocument();
  });

  it('converts an unsaved draft when the unit preference changes', async () => {
    weightUnit = 'lbs';
    const { rerender } = render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (lbs)'), {
      target: { value: '180' },
    });
    weightUnit = 'kg';
    rerender(<GoalWeight />);
    expect(screen.getByLabelText('Goal weight (kg)')).toHaveValue(81.6);
    fireEvent.click(screen.getByText('Save goal weight'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0].targetWeightKg).toBeCloseTo(81.6, 1);
  });

  it('hides Clear when no goal is saved', () => {
    targetWeight = null;
    render(<GoalWeight />);
    expect(screen.queryByText('Clear')).toBeNull();
  });

  it('saves a target date with the saved weight untouched', async () => {
    targetWeight = '80.05';
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Target date (optional)'), {
      target: { value: '2099-03-01' },
    });
    fireEvent.click(screen.getByText('Save goal weight'));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        targetWeightKg: 80.05,
        targetDate: '2099-03-01',
      })
    );
  });

  it('removes a saved date with null', async () => {
    targetWeightDate = '2099-03-01';
    render(<GoalWeight />);
    expect(screen.getByLabelText('Target date (optional)')).toHaveValue(
      '2099-03-01'
    );
    fireEvent.change(screen.getByLabelText('Target date (optional)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('Save goal weight'));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        targetWeightKg: 80,
        targetDate: null,
      })
    );
  });

  it('keeps the saved date when only the weight changes', async () => {
    targetWeightDate = '2099-03-01';
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (kg)'), {
      target: { value: '78' },
    });
    fireEvent.click(screen.getByText('Save goal weight'));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        targetWeightKg: 78,
        targetDate: undefined,
      })
    );
  });
});
