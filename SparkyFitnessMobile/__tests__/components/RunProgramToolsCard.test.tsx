import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { programStatus } from '@workspace/shared';
import RunProgramToolsCard from '../../src/components/recording/RunProgramToolsCard';

const handlers = () => ({
  onOpenCalendar: jest.fn(),
  onCustomize: jest.fn(),
  onOpenPaces: jest.fn(),
  onChooseProgram: jest.fn(),
  onPickWorkout: jest.fn(),
  onSkip: jest.fn(),
  onRestart: jest.fn(),
});

test('lists the tools and runs each one', () => {
  const h = handlers();
  render(
    <RunProgramToolsCard
      status={programStatus({ programId: 'beginner5k', next: 4 })!}
      programId="beginner5k"
      {...h}
    />
  );
  expect(screen.getByText('Tools & plan actions')).toBeTruthy();
  fireEvent.press(screen.getByText('Open the training calendar'));
  fireEvent.press(screen.getByTestId('customize-current'));
  fireEvent.press(screen.getByTestId('run-program-tools-paces'));
  fireEvent.press(screen.getByText('Skip current workout'));
  fireEvent.press(screen.getByText('Start over'));
  expect(h.onOpenCalendar).toHaveBeenCalled();
  expect(h.onCustomize).toHaveBeenCalled();
  expect(h.onOpenPaces).toHaveBeenCalled();
  expect(h.onSkip).toHaveBeenCalled();
  expect(h.onRestart).toHaveBeenCalled();
  expect(screen.getByText('Change program')).toBeTruthy();
  expect(screen.getByText('Choose a different workout')).toBeTruthy();
});

test('has no customize row for a plan the person wrote, and no start over before the first workout', () => {
  render(
    <RunProgramToolsCard
      status={programStatus({ programId: 'beginner5k', next: 0 })!}
      programId="beginner5k"
      {...handlers()}
      onCustomize={undefined}
    />
  );
  expect(screen.queryByTestId('customize-current')).toBeNull();
  expect(screen.queryByText('Start over')).toBeNull();
  expect(screen.getByText('Skip current workout')).toBeTruthy();
});
