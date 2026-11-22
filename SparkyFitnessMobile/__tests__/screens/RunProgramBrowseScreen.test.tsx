import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { findProgram, programWeeks } from '@workspace/shared';
import RunProgramBrowseScreen from '../../src/screens/RunProgramBrowseScreen';
import {
  setProgramEnabled,
  setProgramPosition,
  startProgram,
  useRunProgram,
} from '../../src/services/runProgramService';
import {
  runProgramHookValue,
  storedBeginnerProgram,
} from '../helpers/runProgramFixture';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  startProgram: jest.fn(() => Promise.resolve()),
  setProgramEnabled: jest.fn(() => Promise.resolve()),
  setProgramPosition: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

const metrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const renderScreen = () => {
  const navigate = jest.fn();
  const props = {
    navigation: { navigate, goBack: jest.fn() },
    route: { key: 'RunProgramBrowse', name: 'RunProgramBrowse' },
  } as unknown as React.ComponentProps<typeof RunProgramBrowseScreen>;
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RunProgramBrowseScreen {...props} />
    </SafeAreaProvider>
  );
  return navigate;
};

describe('RunProgramBrowseScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useRunProgram)
      .mockReturnValue(
        runProgramHookValue(storedBeginnerProgram()) as unknown as ReturnType<
          typeof useRunProgram
        >
      );
  });

  it('lists the programs and marks the one being followed', () => {
    renderScreen();
    expect(screen.getByTestId('run-program-beginner5k')).toBeTruthy();
    expect(screen.getByTestId('run-program-current-beginner5k')).toBeTruthy();
    expect(screen.queryByText('Start program')).toBeNull();
  });

  it('shows every week of a program without changing the current one', () => {
    renderScreen();
    const program = findProgram('beginner5k')!;
    const lastIndex = program.workouts.length - 1;
    expect(
      screen.queryByTestId(`run-program-weeks-beginner5k-workout-${lastIndex}`)
    ).toBeNull();

    fireEvent.press(screen.getByTestId('run-program-weeks-beginner5k-toggle'));

    expect(
      screen.getByTestId(`run-program-weeks-beginner5k-workout-${lastIndex}`)
    ).toBeTruthy();
    expect(
      screen.getAllByText(`Week ${programWeeks(program).length}`).length
    ).toBeGreaterThan(0);
    expect(startProgram).not.toHaveBeenCalled();
    expect(setProgramEnabled).not.toHaveBeenCalled();
    expect(setProgramPosition).not.toHaveBeenCalled();
  });

  it('copies a program into a new plan from Customize', () => {
    const navigate = renderScreen();
    fireEvent.press(screen.getByTestId('browse-customize-beginner5k'));
    expect(navigate).toHaveBeenCalledWith('RunProgramEdit', {
      fromProgramId: 'beginner5k',
    });
    expect(startProgram).not.toHaveBeenCalled();
  });
});
