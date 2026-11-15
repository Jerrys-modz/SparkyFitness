import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FitnessTestHeartRateCard from '../../src/components/recording/FitnessTestHeartRateCard';
import { useCardioSessionDetail } from '../../src/hooks/useCardioSessionDetail';
import {
  useHeartRateZones,
  useUpdateHeartRateZones,
} from '../../src/hooks/useHeartRateZones';
import { fitnessTest } from '../helpers/fitnessTestFixture';

jest.mock('../../src/hooks/useCardioSessionDetail', () => ({
  useCardioSessionDetail: jest.fn(),
}));
jest.mock('../../src/hooks/useHeartRateZones', () => ({
  useHeartRateZones: jest.fn(),
  useUpdateHeartRateZones: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const START = Date.parse('2026-11-01T08:00:00.000Z');
const mutate = jest.fn();

/** One reading a second for 30 minutes: 155 for 10 minutes, then 172, 192 at the very end. */
const thirtyMinuteRun = () =>
  Array.from({ length: 1801 }, (_, s) => ({
    timestamp: START + s * 1000,
    bpm: s < 600 ? 155 : s > 1780 ? 192 : 172,
    elapsedMinutes: s / 60,
  }));

const thirtyMinuteTest = fitnessTest({
  exercise_entry_id: 'entry-1',
  measurement: {
    type: '30min',
    distanceMeters: 6000,
    durationSeconds: 1800,
    splitDistanceMeters: 2000,
  },
});

function mockZones(
  settings: Partial<{
    method: 'percent_max' | 'custom';
    custom_floors: number[] | null;
  }> = {},
  maxHr = 185
) {
  jest.mocked(useHeartRateZones).mockReturnValue({
    zones: {
      settings: {
        max_heart_rate: null,
        resting_heart_rate: null,
        method: 'percent_max',
        custom_floors: null,
        display_zones: 5,
        ...settings,
      },
      resolved: { max_hr: maxHr } as never,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as never);
}

function mockHeartRate(heartRate: ReturnType<typeof thirtyMinuteRun>) {
  jest.mocked(useCardioSessionDetail).mockReturnValue({
    heartRate,
    isHeartRateLoading: false,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useUpdateHeartRateZones)
    .mockReturnValue({ mutate, isPending: false } as never);
  mockZones();
  mockHeartRate(thirtyMinuteRun());
});

it('shows threshold zones from the 30-minute run and saves them as custom zones', () => {
  render(<FitnessTestHeartRateCard test={thirtyMinuteTest} />);
  expect(screen.getByTestId('fitness-hr-threshold')).toHaveTextContent(
    /Threshold heart rate 172 bpm/
  );
  expect(screen.getByTestId('fitness-hr-zone-1')).toHaveTextContent(
    /Zone 1120–145 bpm/
  );
  expect(screen.getByTestId('fitness-hr-zone-5')).toHaveTextContent(
    /172\+ bpm/
  );
  fireEvent.press(screen.getByTestId('fitness-hr-use-zones'));
  expect(mutate).toHaveBeenCalledWith(
    { method: 'custom', custom_floors: [120, 146, 155, 163, 172] },
    expect.any(Object)
  );
});

it('offers the peak as a new max when it beats the max in use', () => {
  render(<FitnessTestHeartRateCard test={thirtyMinuteTest} />);
  expect(screen.getByTestId('fitness-hr-max')).toHaveTextContent(
    /You reached 192 bpm, above the 185 bpm max/
  );
  fireEvent.press(screen.getByTestId('fitness-hr-set-max'));
  expect(mutate).toHaveBeenCalledWith(
    { max_heart_rate: 192 },
    expect.any(Object)
  );
});

it('says when the zones are already in use and the max is high enough', () => {
  mockZones(
    { method: 'custom', custom_floors: [120, 146, 155, 163, 172] },
    200
  );
  render(<FitnessTestHeartRateCard test={thirtyMinuteTest} />);
  expect(screen.getByTestId('fitness-hr-in-use')).toBeTruthy();
  expect(screen.queryByTestId('fitness-hr-use-zones')).toBeNull();
  expect(screen.queryByTestId('fitness-hr-max')).toBeNull();
});

it('explains a 30-minute run without enough heart rate', () => {
  mockHeartRate([]);
  render(<FitnessTestHeartRateCard test={thirtyMinuteTest} />);
  expect(screen.getByTestId('fitness-hr-none')).toBeTruthy();
});

it('shows only the max for a 5K, and nothing when the max is high enough', () => {
  const fiveK = fitnessTest({ exercise_entry_id: 'entry-2' });
  const { rerender } = render(<FitnessTestHeartRateCard test={fiveK} />);
  expect(screen.queryByTestId('fitness-hr-threshold')).toBeNull();
  expect(screen.getByTestId('fitness-hr-max')).toBeTruthy();

  mockZones({}, 200);
  rerender(<FitnessTestHeartRateCard test={fiveK} />);
  expect(screen.queryByTestId('fitness-hr-card')).toBeNull();
});

it('renders nothing for a test with no recorded activity', () => {
  render(<FitnessTestHeartRateCard test={fitnessTest()} />);
  expect(screen.queryByTestId('fitness-hr-card')).toBeNull();
  expect(useCardioSessionDetail).not.toHaveBeenCalled();
});
