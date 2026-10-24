import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { BestEffortBoardItem } from '@workspace/shared';
import { BestEffortsCard } from '@/components/ExerciseCharts/BestEffortsCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string, options?: Record<string, string>) =>
      Object.entries(options ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        defaultValue
      ),
  }),
}));

const item = (
  id: BestEffortBoardItem['id'],
  distanceMeters: number,
  seconds: number
): BestEffortBoardItem => ({
  id,
  distanceMeters,
  seconds,
  activityId: 'run-1',
  activityName: 'Morning Run',
  achievedAt: '2026-09-20',
  startMeters: 0,
  endMeters: distanceMeters,
});

const efforts = [
  item('1k', 1000, 240),
  item('1mi', 1609.344, 400),
  item('5k', 5000, 1500),
];

const renderCard = (
  overrides: Partial<React.ComponentProps<typeof BestEffortsCard>> = {}
) =>
  render(
    <BestEffortsCard
      efforts={efforts}
      distanceUnit="km"
      runsAnalyzed={12}
      truncated={false}
      formatDay={(day) => `on ${day}`}
      {...overrides}
    />
  );

describe('BestEffortsCard', () => {
  it('shows time, pace and day for each distance, with the kilometre for a metric person', () => {
    renderCard();
    expect(screen.getByTestId('best-effort-1k')).toHaveTextContent('1 km');
    expect(screen.getByTestId('best-effort-1k')).toHaveTextContent('4:00');
    expect(screen.getByTestId('best-effort-1k')).toHaveTextContent('4:00 /km');
    expect(screen.getByTestId('best-effort-1k')).toHaveTextContent(
      'on 2026-09-20'
    );
    expect(screen.getByTestId('best-effort-5k')).toHaveTextContent('25:00');
    expect(screen.queryByTestId('best-effort-1mi')).toBeNull();
  });

  it('shows the mile instead of the kilometre with the miles setting', () => {
    renderCard({ distanceUnit: 'miles' });
    expect(screen.getByTestId('best-effort-1mi')).toHaveTextContent('6:40 /mi');
    expect(screen.queryByTestId('best-effort-1k')).toBeNull();
  });

  it('says when the search stopped at the most recent runs', () => {
    renderCard({ truncated: true, runsAnalyzed: 1000 });
    expect(
      screen.getByText('Searched your 1000 most recent runs with a route.')
    ).toBeInTheDocument();
  });

  it('explains an empty board', () => {
    renderCard({ efforts: [] });
    expect(screen.getByText(/at least 1 km/)).toBeInTheDocument();
  });
});
