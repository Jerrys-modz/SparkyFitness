import React from 'react';
import { render, within } from '@testing-library/react-native';
import type { BestEffort, BestEffortBoardItem } from '@workspace/shared';
import BestEffortsCard from '../../../src/components/exerciseStats/BestEffortsCard';
import RunBestEfforts from '../../../src/components/exerciseStats/RunBestEfforts';
import { initializeI18n } from '../../../src/localization';

const board = (
  id: BestEffortBoardItem['id'],
  distanceMeters: number,
  seconds: number,
  overrides: Partial<BestEffortBoardItem> = {}
): BestEffortBoardItem => ({
  id,
  distanceMeters,
  seconds,
  activityId: 'run-1',
  activityName: 'Morning Run',
  achievedAt: '2026-09-20',
  startMeters: 0,
  endMeters: distanceMeters,
  ...overrides,
});

const effort = (
  id: BestEffort['id'],
  distanceMeters: number,
  seconds: number
): BestEffort => ({
  id,
  distanceMeters,
  seconds,
  startMeters: 0,
  endMeters: distanceMeters,
  startSeconds: 0,
  endSeconds: seconds,
});

beforeAll(async () => {
  await initializeI18n('en');
});

describe('BestEffortsCard', () => {
  const efforts = [
    board('1k', 1000, 240),
    board('1mi', 1609.344, 400),
    board('5k', 5000, 1500),
  ];

  it('shows the kilometre rows with time and pace for a metric person', () => {
    const screen = render(
      <BestEffortsCard
        efforts={efforts}
        distanceUnit="km"
        runsAnalyzed={12}
        truncated={false}
      />
    );
    expect(screen.getByText('Best efforts')).toBeTruthy();
    expect(screen.getByText('1 km')).toBeTruthy();
    expect(screen.getByText('4:00')).toBeTruthy();
    expect(screen.getByText('4:00 /km')).toBeTruthy();
    expect(screen.getByText('5 km')).toBeTruthy();
    expect(screen.getByText('25:00')).toBeTruthy();
    expect(screen.queryByText('1 mile')).toBeNull();
    expect(screen.getByText(/Searched 12 runs with a route/)).toBeTruthy();
  });

  it('swaps the short distance for the mile with the miles setting', () => {
    const screen = render(
      <BestEffortsCard
        efforts={efforts}
        distanceUnit="miles"
        runsAnalyzed={12}
        truncated={false}
      />
    );
    expect(screen.getByText('1 mile')).toBeTruthy();
    expect(screen.getByText('6:40')).toBeTruthy();
    expect(screen.getByText('6:40 /mi')).toBeTruthy();
    expect(screen.queryByText('1 km')).toBeNull();
  });

  it('says so when the search stopped at the most recent runs', () => {
    const screen = render(
      <BestEffortsCard
        efforts={efforts}
        distanceUnit="km"
        runsAnalyzed={1000}
        truncated
      />
    );
    expect(
      screen.getByText('Searched your 1000 most recent runs with a route.')
    ).toBeTruthy();
  });

  it('explains an empty board', () => {
    const screen = render(
      <BestEffortsCard
        efforts={[]}
        distanceUnit="km"
        runsAnalyzed={0}
        truncated={false}
      />
    );
    expect(screen.getByText(/at least 1 km/)).toBeTruthy();
  });
});

describe('RunBestEfforts', () => {
  const runEfforts = [effort('1k', 1000, 250), effort('5k', 5000, 1400)];

  it('lists the fastest stretch of each distance in the run', () => {
    const screen = render(
      <RunBestEfforts
        efforts={runEfforts}
        distanceUnit="km"
        activityId="run-1"
      />
    );
    expect(screen.getByText('Fastest stretches in this run')).toBeTruthy();
    expect(screen.getByText('Fastest 1 km')).toBeTruthy();
    expect(screen.getByText('4:10')).toBeTruthy();
    expect(screen.getByText('Fastest 5 km')).toBeTruthy();
    expect(screen.queryByText('Your best ever')).toBeNull();
  });

  it('marks a stretch that is the best on the all-time board', () => {
    const screen = render(
      <RunBestEfforts
        efforts={runEfforts}
        distanceUnit="km"
        activityId="run-1"
        board={[
          board('1k', 1000, 250),
          board('5k', 5000, 1300, { activityId: 'other' }),
        ]}
      />
    );
    expect(screen.getAllByText('Your best ever')).toHaveLength(1);
    expect(
      within(screen.getByTestId('run-best-effort-1k')).getByText(
        'Your best ever'
      )
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('run-best-effort-5k')).queryByText(
        'Your best ever'
      )
    ).toBeNull();
  });

  it('renders nothing when the run reached no distance', () => {
    const screen = render(
      <RunBestEfforts efforts={[]} distanceUnit="km" activityId="run-1" />
    );
    expect(screen.queryByTestId('run-best-efforts')).toBeNull();
  });
});
