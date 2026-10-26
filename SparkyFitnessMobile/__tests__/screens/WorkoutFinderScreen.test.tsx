import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import WorkoutFinderScreen from '../../src/screens/WorkoutFinderScreen';

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
    route: { key: 'WorkoutFinder', name: 'WorkoutFinder' },
  }) as unknown as React.ComponentProps<typeof WorkoutFinderScreen>;

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <WorkoutFinderScreen {...props()} />
    </SafeAreaProvider>
  );

const choose = (row: string, label: string) =>
  fireEvent.press(within(screen.getByTestId(`finder-${row}`)).getByText(label));

const resultIds = () =>
  [0, 1, 2].map((i) =>
    within(screen.getByTestId(`finder-result-${i}`))
      .getByTestId(/^workout-split-(?!sessions)/)
      .props.testID.replace('workout-split-', '')
  );

describe('WorkoutFinderScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recommends the closest programs, best match first', () => {
    renderScreen();
    choose('venue', 'At home');
    choose('days', '4');
    expect(resultIds()[0]).toBe('upper_lower_4_home');
    const best = within(screen.getByTestId('finder-result-0'));
    expect(best.getByText(/Best match\./)).toBeTruthy();
    expect(best.getByText(/Matches everything you asked for\./)).toBeTruthy();
  });

  it('says where the closest program differs from what was asked', () => {
    renderScreen();
    choose('venue', 'At home');
    choose('days', '5');
    expect(
      within(screen.getByTestId('finder-result-0')).getByText(
        /Closest match: .*days a week/
      )
    ).toBeTruthy();
  });

  it('shows the sessions fitted to the workout length', () => {
    renderScreen();
    choose('minutes', '40 min');
    const card = within(screen.getByTestId('finder-result-0'));
    fireEvent.press(card.getByText('Show sessions'));
    expect(card.getAllByText(/about 40 min/).length).toBeGreaterThan(0);
  });

  it('adds the focus muscle exercise to the fitted sessions', () => {
    renderScreen();
    choose('venue', 'At home');
    fireEvent.press(
      within(screen.getByTestId('finder-focus')).getByText('Core')
    );
    const card = within(screen.getByTestId('finder-result-0'));
    fireEvent.press(card.getByText('Show sessions'));
    expect(card.getAllByText('Plank').length).toBeGreaterThan(0);
  });

  it('opens the add screen with the answers, not an exercise list', () => {
    renderScreen();
    choose('venue', 'At home');
    choose('days', '4');
    choose('minutes', '40 min');
    fireEvent.press(
      within(screen.getByTestId('finder-focus')).getByText('Arms')
    );
    fireEvent.press(
      within(screen.getByTestId('finder-result-0')).getByText(
        'Add to my workouts'
      )
    );
    expect(navigate).toHaveBeenCalledWith('WorkoutSplitImport', {
      splitId: 'upper_lower_4_home',
      trainer: { venue: 'home', sessionMinutes: 40, focus: 'arms' },
    });
  });
});
