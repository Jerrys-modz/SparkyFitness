import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WORKOUT_SPLITS } from '@workspace/shared';
import WorkoutSplitsScreen from '../../src/screens/WorkoutSplitsScreen';

const metrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

const navigate = jest.fn();
const props = () =>
  ({
    navigation: { navigate, goBack: jest.fn() },
    route: { key: 'WorkoutSplits', name: 'WorkoutSplits' },
  }) as unknown as React.ComponentProps<typeof WorkoutSplitsScreen>;

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <WorkoutSplitsScreen {...props()} />
    </SafeAreaProvider>
  );

const choose = (filter: string, label: string) =>
  fireEvent.press(
    within(screen.getByTestId(`filter-${filter}`)).getByText(label)
  );

const shownIds = () =>
  screen
    .queryAllByTestId(/^workout-split-(?!sessions)/)
    .map((card) => card.props.testID as string);

describe('WorkoutSplitsScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists every program', () => {
    renderScreen();
    expect(shownIds()).toHaveLength(WORKOUT_SPLITS.length);
    expect(screen.getByText('Linear 5x5')).toBeTruthy();
  });

  it('shows what the chosen venue can do, plus the smaller ones', () => {
    renderScreen();
    choose('venue', 'At home');
    expect(shownIds()).toEqual([
      'workout-split-full_body_3_home',
      'workout-split-upper_lower_4_home',
      'workout-split-push_pull_legs_3_home',
    ]);

    choose('venue', 'Garage gym');
    expect(shownIds()).toContain('workout-split-linear_5x5');
    expect(shownIds()).toContain('workout-split-full_body_3_home');
    expect(shownIds()).not.toContain('workout-split-body_part_5');
  });

  it('combines the filters and says when nothing matches', () => {
    renderScreen();
    choose('venue', 'At home');
    choose('goal', 'Gain strength');
    expect(screen.getByText(/No program matches/)).toBeTruthy();
  });

  it('shows a program’s sessions with their targets', () => {
    renderScreen();
    const card = within(screen.getByTestId('workout-split-linear_5x5'));
    fireEvent.press(card.getByText('Show sessions'));
    const sessions = within(
      screen.getByTestId('workout-split-sessions-linear_5x5')
    );
    expect(sessions.getByText('Workout A')).toBeTruthy();
    expect(sessions.getAllByText('Barbell Squat')).toHaveLength(2);
    expect(sessions.getAllByText('5 x 5').length).toBeGreaterThan(0);
    fireEvent.press(card.getByText('Hide sessions'));
    expect(
      screen.queryByTestId('workout-split-sessions-linear_5x5')
    ).toBeNull();
  });

  it('opens the add screen for the chosen program', () => {
    renderScreen();
    const card = within(screen.getByTestId('workout-split-linear_5x5'));
    fireEvent.press(card.getByText('Add to my workouts'));
    expect(navigate).toHaveBeenCalledWith('WorkoutSplitImport', {
      splitId: 'linear_5x5',
    });
  });

  it('opens the program finder', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Find my program'));
    expect(navigate).toHaveBeenCalledWith('WorkoutFinder');
  });
});
