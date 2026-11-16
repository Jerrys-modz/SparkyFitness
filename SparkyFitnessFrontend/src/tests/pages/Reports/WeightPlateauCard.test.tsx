import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { addDays, todayInZone } from '@workspace/shared';
import { WeightPlateauCard } from '@/pages/Reports/WeightPlateauCard';
import { useRecentStandardMeasurements } from '@/hooks/CheckIn/useCheckIn';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
      const opts =
        typeof fallback === 'object' && fallback !== null
          ? (fallback as Record<string, unknown>)
          : (options ?? {});
      const template =
        typeof fallback === 'string'
          ? fallback
          : String(opts['defaultValue_other'] ?? key);
      return Object.entries(opts).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        template
      );
    },
  }),
}));

let actingOnBehalf = false;
let goalMode = 'cut';
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    activeUserId: 'user-1',
    isActingOnBehalf: actingOnBehalf,
  }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    goalMode,
    goalModeCustomPercentage: 0,
    goalModeWeeklyChangeKg: 0,
  }),
}));
jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useRecentStandardMeasurements: jest.fn(),
}));

const today = todayInZone('UTC');
// Daily weigh-ins over the last 21 days that barely move.
const flat = Array.from({ length: 21 }, (_, i) => ({
  entry_date: addDays(today, i - 20),
  weight: i % 2 === 0 ? 80.2 : 80,
}));

beforeEach(() => {
  actingOnBehalf = false;
  goalMode = 'cut';
  window.localStorage.clear();
  jest
    .mocked(useRecentStandardMeasurements)
    .mockReturnValue({ data: flat } as unknown as ReturnType<
      typeof useRecentStandardMeasurements
    >);
});

describe('WeightPlateauCard', () => {
  it('shows how long the trend has been flat, with suggestions', () => {
    render(<WeightPlateauCard />);
    expect(screen.getByTestId('weight-plateau-card')).toBeInTheDocument();
    expect(
      screen.getByText(/for 21 days \(21 weigh-ins\)/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Adaptive TDEE/)).toBeInTheDocument();
  });

  it('stays hidden at maintenance', () => {
    goalMode = 'maintain';
    render(<WeightPlateauCard />);
    expect(screen.queryByTestId('weight-plateau-card')).toBeNull();
  });

  it('stays hidden while acting for someone else', () => {
    actingOnBehalf = true;
    render(<WeightPlateauCard />);
    expect(screen.queryByTestId('weight-plateau-card')).toBeNull();
  });

  it('can be dismissed, and stays dismissed for the same plateau', () => {
    const { unmount } = render(<WeightPlateauCard />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    });
    expect(screen.queryByTestId('weight-plateau-card')).toBeNull();
    expect(
      window.localStorage.getItem('sparky.weightPlateauDismissedEnd.user-1')
    ).toBe(today);
    unmount();
    render(<WeightPlateauCard />);
    expect(screen.queryByTestId('weight-plateau-card')).toBeNull();
  });
});
