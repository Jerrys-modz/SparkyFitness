import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RunSummaryScreen from '../../src/screens/RunSummaryScreen';
import type { RunSummaryParams } from '../../src/utils/runSummary';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const split = (index: number, durationSeconds: number, partial = false) => ({
  index,
  distanceMeters: partial ? 500 : 1000,
  durationSeconds,
  startT: 0,
  endT: 0,
  partial,
});

const params = (
  overrides: Partial<RunSummaryParams> = {}
): RunSummaryParams => ({
  activity: 'run',
  entryDate: '2026-10-12',
  distanceUnit: 'km',
  distanceMeters: 2500,
  activeSeconds: 750,
  elevationGainMeters: 0,
  avgHeartRate: null,
  route: [],
  splits: [split(1, 300), split(2, 280), split(3, 150, true)],
  laps: [],
  program: null,
  ...overrides,
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const renderScreen = (summary: RunSummaryParams) =>
  render(
    <RunSummaryScreen
      {...({
        navigation,
        route: { key: 'RunSummary', name: 'RunSummary', params: summary },
      } as never)}
    />
  );

beforeEach(() => jest.clearAllMocks());

it('shows the headline figures and the splits', () => {
  renderScreen(params());
  expect(screen.getByText('Run saved')).toBeTruthy();
  expect(screen.getByText('2.50')).toBeTruthy();
  expect(screen.getByText('12:30')).toBeTruthy();
  expect(screen.getByText('5:00')).toBeTruthy();
  expect(screen.getByText('Splits')).toBeTruthy();
  expect(screen.getByText(/Fastest/)).toBeTruthy();
  expect(screen.queryByText('Avg heart rate')).toBeNull();
  expect(screen.queryByText(/Workout \d+ of/)).toBeNull();
});

it('shows heart rate and elevation only when there are some, and laps instead of splits', () => {
  renderScreen(
    params({
      avgHeartRate: 148,
      elevationGainMeters: 42,
      laps: [split(1, 400), split(2, 350)],
    })
  );
  expect(screen.getByText('Avg heart rate')).toBeTruthy();
  expect(screen.getByText('148')).toBeTruthy();
  expect(screen.getByText('Elevation gain')).toBeTruthy();
  expect(screen.getByText('Laps')).toBeTruthy();
  expect(screen.queryByText('Splits')).toBeNull();
});

it('shows program progress, what is next, and opens the program', () => {
  renderScreen(
    params({
      program: {
        nextLine: 'Next: Week 1, run 3 on Wed, Oct 14',
        done: 4,
        total: 27,
        finished: false,
      },
    })
  );
  expect(screen.getByText('Workout 4 of 27 done')).toBeTruthy();
  expect(screen.getByText('Next: Week 1, run 3 on Wed, Oct 14')).toBeTruthy();
  fireEvent.press(screen.getByText('View program'));
  expect(navigation.navigate).toHaveBeenCalledWith('RunPrograms');
});

it('calls a finished program complete', () => {
  renderScreen(
    params({
      program: {
        nextLine: 'Program complete. Well done!',
        done: 27,
        total: 27,
        finished: true,
      },
    })
  );
  expect(screen.getByText('Program complete')).toBeTruthy();
});

it('says walk or ride for those, and Done goes back', () => {
  renderScreen(params({ activity: 'walk', splits: [] }));
  expect(screen.getByText('Walk saved')).toBeTruthy();
  expect(screen.queryByText('Splits')).toBeNull();
  fireEvent.press(screen.getByText('Done'));
  expect(navigation.goBack).toHaveBeenCalled();
});
