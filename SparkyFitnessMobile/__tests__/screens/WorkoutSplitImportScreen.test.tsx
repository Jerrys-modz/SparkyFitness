import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import WorkoutSplitImportScreen from '../../src/screens/WorkoutSplitImportScreen';
import { useImportWorkoutSplit } from '../../src/hooks/useImportWorkoutSplit';

const metrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useImportWorkoutSplit', () => ({
  useImportWorkoutSplit: jest.fn(),
}));

const navigate = jest.fn();
const goBack = jest.fn();
const importSplitAsync = jest.fn();

const renderScreen = (splitId: string) => {
  const props = {
    navigation: { navigate, goBack },
    route: {
      key: 'WorkoutSplitImport',
      name: 'WorkoutSplitImport',
      params: { splitId },
    },
  } as unknown as React.ComponentProps<typeof WorkoutSplitImportScreen>;
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <WorkoutSplitImportScreen {...props} />
    </SafeAreaProvider>
  );
};

const accept = () =>
  fireEvent(
    screen.getByLabelText('Accept the medical disclaimer'),
    'valueChange',
    true
  );

describe('WorkoutSplitImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useImportWorkoutSplit).mockReturnValue({
      importSplitAsync,
      isPending: false,
    });
    importSplitAsync.mockResolvedValue({
      planId: 7,
      presetIds: {},
      addedExerciseCount: 0,
    });
  });

  it('does not add until the disclaimer is accepted', () => {
    renderScreen('linear_5x5');
    fireEvent.press(screen.getByText('Add program'));
    expect(importSplitAsync).not.toHaveBeenCalled();
  });

  it('adds with the shown names, then opens the workout plans', async () => {
    renderScreen('linear_5x5');
    accept();
    await act(async () => {
      fireEvent.press(screen.getByText('Add program'));
    });

    expect(importSplitAsync).toHaveBeenCalledWith({
      splitId: 'linear_5x5',
      body: {
        planName: 'Linear 5x5',
        sessionNames: { workout_a: 'Workout A', workout_b: 'Workout B' },
        activate: true,
      },
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
    expect(navigate).toHaveBeenCalledWith('WorkoutPlans');
  });

  it('sends the edited name and the active switch', async () => {
    renderScreen('linear_5x5');
    fireEvent.changeText(screen.getByLabelText('Plan name'), '  My 5x5  ');
    fireEvent(
      screen.getByLabelText('Make it my active plan'),
      'valueChange',
      false
    );
    accept();
    await act(async () => {
      fireEvent.press(screen.getByText('Add program'));
    });

    expect(importSplitAsync).toHaveBeenCalledWith({
      splitId: 'linear_5x5',
      body: expect.objectContaining({ planName: 'My 5x5', activate: false }),
    });
  });

  it('stays on the screen when the import fails', async () => {
    importSplitAsync.mockRejectedValue(new Error('502'));
    renderScreen('linear_5x5');
    accept();
    await act(async () => {
      fireEvent.press(screen.getByText('Add program'));
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('says so for an unknown program', () => {
    renderScreen('nope');
    expect(screen.getByText('This program is not available.')).toBeTruthy();
    fireEvent.press(screen.getByText('Go back'));
    expect(goBack).toHaveBeenCalled();
  });
});
