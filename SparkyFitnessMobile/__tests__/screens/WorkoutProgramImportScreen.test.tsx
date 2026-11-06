import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
  type WorkoutProgramFile,
} from '@workspace/shared';
import WorkoutProgramImportScreen from '../../src/screens/WorkoutProgramImportScreen';
import { useImportWorkoutProgram } from '../../src/hooks/useWorkoutProgramSharing';

const metrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useWorkoutProgramSharing', () => ({
  useImportWorkoutProgram: jest.fn(),
}));

const navigate = jest.fn();
const importProgramAsync = jest.fn();

const presetsOnly: WorkoutProgramFile = {
  format: WORKOUT_PROGRAM_FILE_FORMAT,
  version: WORKOUT_PROGRAM_FILE_VERSION,
  exercises: [{ key: 'e1', name: 'Push Up' }],
  presets: [
    {
      key: 'p1',
      name: 'Push Day',
      workoutFormat: 'standard',
      exercises: [{ exercise: 'e1', sets: [{ setNumber: 1, reps: 10 }] }],
    },
  ],
  plan: null,
};

const withPlan: WorkoutProgramFile = {
  ...presetsOnly,
  plan: {
    name: 'Friend plan',
    scheduleType: 'weekly',
    entryMode: 'prompt',
    sessions: [{ dayOfWeek: 1, preset: 'p1' }],
  },
};

const renderScreen = (program: WorkoutProgramFile) => {
  const props = {
    navigation: { navigate, goBack: jest.fn() },
    route: {
      key: 'WorkoutProgramImport',
      name: 'WorkoutProgramImport',
      params: { program },
    },
  } as unknown as React.ComponentProps<typeof WorkoutProgramImportScreen>;
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <WorkoutProgramImportScreen {...props} />
    </SafeAreaProvider>
  );
};

const accept = () =>
  fireEvent(
    screen.getByLabelText('Accept the medical disclaimer'),
    'valueChange',
    true
  );

describe('WorkoutProgramImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useImportWorkoutProgram).mockReturnValue({
      importProgramAsync,
      isPending: false,
    });
    importProgramAsync.mockResolvedValue({
      planId: 9,
      presetIds: { p1: 5 },
      addedExerciseCount: 1,
    });
  });

  it('lists the presets in the file', () => {
    renderScreen(presetsOnly);
    expect(screen.getByText('Push Day (1 exercise)')).toBeTruthy();
    expect(screen.queryByLabelText('Plan name')).toBeNull();
  });

  it('does not add until the disclaimer is accepted', () => {
    renderScreen(withPlan);
    fireEvent.press(screen.getByText('Add workouts'));
    expect(importProgramAsync).not.toHaveBeenCalled();
  });

  it('adds a plan with the chosen name, then opens the workout plans', async () => {
    renderScreen(withPlan);
    fireEvent.changeText(screen.getByLabelText('Plan name'), 'From Sam');
    fireEvent(
      screen.getByLabelText('Make it my active plan'),
      'valueChange',
      true
    );
    accept();
    await act(async () => {
      fireEvent.press(screen.getByText('Add workouts'));
    });

    expect(importProgramAsync).toHaveBeenCalledWith({
      program: withPlan,
      planName: 'From Sam',
      activate: true,
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
    expect(navigate).toHaveBeenCalledWith('WorkoutPlans');
  });

  it('adds presets only and opens the presets library', async () => {
    renderScreen(presetsOnly);
    accept();
    await act(async () => {
      fireEvent.press(screen.getByText('Add workouts'));
    });

    expect(importProgramAsync).toHaveBeenCalledWith({
      program: presetsOnly,
      planName: undefined,
      activate: false,
    });
    expect(navigate).toHaveBeenCalledWith('WorkoutPresetsLibrary');
  });

  it('stays on the screen when the import fails', async () => {
    importProgramAsync.mockRejectedValue(new Error('502'));
    renderScreen(presetsOnly);
    accept();
    await act(async () => {
      fireEvent.press(screen.getByText('Add workouts'));
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});
