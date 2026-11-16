import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GoalBodyFat } from '@/pages/Goals/GoalBodyFat';

const mutateAsync = jest.fn();
let targetBodyFat: string | null = '18.0';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      arg?: string | { defaultValue?: string; min?: number; max?: number }
    ) =>
      typeof arg === 'string'
        ? arg
        : (arg?.defaultValue ?? '')
            .replace('{{min}}', String(arg?.min ?? ''))
            .replace('{{max}}', String(arg?.max ?? '')),
  }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({
    data: { target_body_fat_percentage: targetBodyFat },
  }),
}));
jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useSetTargetBodyFat: () => ({ mutateAsync, isPending: false }),
}));

describe('GoalBodyFat', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
    targetBodyFat = '18.0';
  });

  it('shows the saved goal', () => {
    render(<GoalBodyFat />);
    expect(screen.getByLabelText('Body fat goal (%)')).toHaveValue(18);
  });

  it('explains that readings vary by method', () => {
    render(<GoalBodyFat />);
    expect(
      screen.getByText(/Body fat readings vary a lot between methods/)
    ).toBeInTheDocument();
  });

  it('saves a new goal rounded to one decimal', async () => {
    render(<GoalBodyFat />);
    fireEvent.change(screen.getByLabelText('Body fat goal (%)'), {
      target: { value: '15.26' },
    });
    fireEvent.click(screen.getByText('Save body fat goal'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(15.3));
  });

  it.each(['2', '61', '-4'])('refuses %s and explains the range', (value) => {
    render(<GoalBodyFat />);
    fireEvent.change(screen.getByLabelText('Body fat goal (%)'), {
      target: { value },
    });
    expect(
      screen.getByText('Enter a body fat goal from 3% to 60%.')
    ).toBeInTheDocument();
    expect(screen.getByText('Save body fat goal')).toBeDisabled();
  });

  it('clears the saved goal', async () => {
    render(<GoalBodyFat />);
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(null));
  });

  it('hides Clear when no goal is saved', () => {
    targetBodyFat = null;
    render(<GoalBodyFat />);
    expect(screen.getByLabelText('Body fat goal (%)')).toHaveValue(null);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });
});
