import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import WatchRunLiveScreen from '../../src/screens/WatchRunLiveScreen';
import { useWatchRunLive } from '../../src/stores/watchRunLiveStore';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/stores/watchRunLiveStore', () => ({
  useWatchRunLive: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const navigation = { goBack: jest.fn() };
const renderScreen = () =>
  render(<WatchRunLiveScreen {...({ navigation } as never)} />);

const run = (overrides: Record<string, unknown> = {}) => ({
  runId: 'r1',
  kind: 'run',
  place: 'indoor',
  status: 'running',
  autoPaused: false,
  elapsed: 600,
  elapsedNow: 605,
  distanceMeters: 1500,
  heartRate: 152,
  energyKcal: 90,
  lapCount: 2,
  stepLabel: null,
  stepRemaining: null,
  stepRemainingNow: null,
  nextLabel: null,
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

it('shows the clock, distance, pace, heart rate and laps', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(run() as never);
  renderScreen();
  expect(screen.getByText('Running on your watch')).toBeTruthy();
  expect(screen.getByText('10:05')).toBeTruthy();
  expect(screen.getByText('1.50')).toBeTruthy();
  expect(screen.getByText('152')).toBeTruthy();
  expect(screen.getByText(/treadmill/)).toBeTruthy();
});

it('shows the plan step, its time left and the next one', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(
    run({
      stepLabel: 'Run',
      stepRemainingNow: 59.2,
      nextLabel: 'Walk',
    }) as never
  );
  renderScreen();
  expect(screen.getByText('Run')).toBeTruthy();
  expect(screen.getByText('1:00')).toBeTruthy();
  expect(screen.getByText('Next: Walk')).toBeTruthy();
});

it('says when the watch paused it, and when it paused itself', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ status: 'paused', autoPaused: true }) as never);
  renderScreen();
  expect(screen.getByText('Auto-paused')).toBeTruthy();
});

it('explains an ended run and goes back', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(null);
  renderScreen();
  expect(screen.getByText(/has ended or is out of range/)).toBeTruthy();
  fireEvent.press(screen.getByText('Done'));
  expect(navigation.goBack).toHaveBeenCalled();
});
