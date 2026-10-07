import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GoalWeight } from '@/pages/Goals/GoalWeight';

const mutateAsync = jest.fn();
let weightUnit = 'kg';
let targetWeight: string | null = '80.00';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      arg?: string | { defaultValue?: string; unit?: string }
    ) =>
      typeof arg === 'string'
        ? arg
        : (arg?.defaultValue ?? '').replace('{{unit}}', arg?.unit ?? ''),
  }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: { target_weight: targetWeight } }),
}));
jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useSetTargetWeight: () => ({ mutateAsync, isPending: false }),
}));

describe('GoalWeight', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
    weightUnit = 'kg';
    targetWeight = '80.00';
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
    expect(mutateAsync.mock.calls[0][0]).toBeCloseTo(81.65, 2);
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

  it('clears the goal with null', async () => {
    render(<GoalWeight />);
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(null));
  });

  it('hides Clear when no goal is saved', () => {
    targetWeight = null;
    render(<GoalWeight />);
    expect(screen.queryByText('Clear')).toBeNull();
  });
});
