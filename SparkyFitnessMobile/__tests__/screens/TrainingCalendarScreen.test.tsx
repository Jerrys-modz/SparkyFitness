import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TrainingCalendarResponse } from '@workspace/shared';
import TrainingCalendarScreen from '../../src/screens/TrainingCalendarScreen';
import { useTrainingCalendar } from '../../src/hooks/useTrainingCalendar';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/useTrainingCalendar', () => ({
  useTrainingCalendar: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { first_day_of_week: 1 } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: () => '2026-10-14',
}));

const none = { running: 0, cycling: 0, walking: 0, strength: 0, other: 0 };
const planned = (
  id: string,
  day: string,
  status: 'done' | 'partial' | 'missed' | 'upcoming'
) => ({
  id,
  day,
  source: 'workoutPlan' as const,
  sport: 'strength' as const,
  label: id,
  programId: null,
  workoutNumber: null,
  plannedMinutes: 40,
  plannedLoad: 80,
  status,
  completedMinutes: status === 'done' ? 40 : status === 'partial' ? 20 : 0,
  completedLoad: 0,
  entryIds: [],
});
const data = {
  start: '2026-09-28',
  end: '2026-11-01',
  today: '2026-10-14',
  planned: [
    planned('Push', '2026-10-12', 'done'),
    planned('Legs', '2026-10-13', 'missed'),
    planned('Pull', '2026-10-14', 'partial'),
    planned('Core', '2026-10-16', 'upcoming'),
  ],
  completed: [
    {
      id: 'e1',
      day: '2026-10-14',
      name: 'Evening run',
      sport: 'running' as const,
      minutes: 30,
      distanceKm: 5,
      avgHeartRate: null,
      load: 60,
      loadBasis: 'estimated' as const,
      plannedItemId: null,
    },
  ],
  weeks: [
    {
      start: '2026-10-12',
      plannedSessions: 4,
      doneSessions: 1,
      partialSessions: 1,
      missedSessions: 1,
      extraSessions: 1,
      completedSessions: 3,
      plannedMinutes: 160,
      completedMinutes: 90,
      plannedLoad: 320,
      completedLoad: 140,
      completedDistanceKm: 5,
    },
  ],
  sportLoad: { weeks: [], months: [], total: none },
  fitnessFatigue: { today: null, status: 'noData' as const },
} as TrainingCalendarResponse;

const state = (overrides: Record<string, unknown> = {}) =>
  jest.mocked(useTrainingCalendar).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as never);
const renderScreen = () =>
  render(<TrainingCalendarScreen {...({} as never)} />);

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => jest.clearAllMocks());

test('asks for the month grid from the first day of the week', () => {
  state();
  renderScreen();
  expect(useTrainingCalendar).toHaveBeenCalledWith('2026-09-28', '2026-11-01');
});

test('marks each planned item by status and extra work on the days', () => {
  state();
  renderScreen();
  expect(screen.getAllByTestId('planned-dot-done')).toHaveLength(1);
  expect(screen.getAllByTestId('planned-dot-missed')).toHaveLength(1);
  expect(screen.getAllByTestId('planned-dot-partial')).toHaveLength(1);
  expect(screen.getAllByTestId('planned-dot-upcoming')).toHaveLength(1);
  expect(screen.getAllByTestId('extra-dot')).toHaveLength(1);
});

test('opens today first and a tapped day with its planned and completed work', () => {
  state();
  renderScreen();
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByText('Pull')).toBeTruthy();
  expect(screen.getByText('Evening run')).toBeTruthy();
  expect(screen.getAllByText('Extra').length).toBeGreaterThan(1);
  fireEvent.press(screen.getByTestId('calendar-day-2026-10-13'));
  expect(screen.getByText('Legs')).toBeTruthy();
  expect(screen.getByText(/^Missed · Strength/)).toBeTruthy();
  expect(screen.queryByText('Evening run')).toBeNull();
});

test('totals the week planned against completed', () => {
  state();
  renderScreen();
  expect(screen.getByText(/2 of 4 planned sessions/)).toBeTruthy();
  expect(screen.getByText(/1 extra/)).toBeTruthy();
  expect(screen.getByText(/Time 90 of 160 min/)).toBeTruthy();
  expect(screen.getByText(/Load 140 of 320/)).toBeTruthy();
});

test('shows a retry when the calendar cannot be loaded', () => {
  const refetch = jest.fn();
  state({ data: undefined, isError: true, refetch });
  renderScreen();
  fireEvent.press(screen.getByText('Retry'));
  expect(refetch).toHaveBeenCalled();
});

test('week view lists the seven days of the chosen week', () => {
  state();
  renderScreen();
  fireEvent.press(screen.getByText('Week'));
  expect(screen.getAllByText('Week of Oct 12').length).toBeGreaterThan(1);
});
