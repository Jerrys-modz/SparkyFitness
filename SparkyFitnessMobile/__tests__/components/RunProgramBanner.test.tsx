import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { programStatus } from '@workspace/shared';
import RunProgramBanner from '../../src/components/recording/RunProgramBanner';
import { useRunProgram } from '../../src/services/runProgramService';
import { toLocalDateString } from '../../src/utils/dateUtils';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
}));

const mockedProgram = jest.mocked(useRunProgram);
const today = toLocalDateString(new Date());

const program = (
  over: Partial<ReturnType<typeof useRunProgram>> = {}
): ReturnType<typeof useRunProgram> => ({
  status: programStatus({ programId: 'beginner5k', next: 4 })!,
  enabled: true,
  lastAdjustment: null,
  schedule: { days: [], startDay: null },
  doneDay: null,
  loaded: true,
  ...over,
});

beforeEach(() => mockedProgram.mockReturnValue(program()));

test("offers today's workout with a Start button", () => {
  const onStart = jest.fn();
  render(<RunProgramBanner date={today} onStart={onStart} />);
  expect(screen.getByText(/Beginner 5K •/)).toBeTruthy();
  expect(screen.getByText(/Week 2, run 2 ·/)).toBeTruthy();
  fireEvent.press(screen.getByText('Start'));
  expect(onStart).toHaveBeenCalled();
});

test('waits for the start day', () => {
  mockedProgram.mockReturnValue(
    program({ schedule: { days: [], startDay: '2999-01-01' } })
  );
  render(<RunProgramBanner date={today} onStart={jest.fn()} />);
  expect(screen.queryByTestId('run-program-banner')).toBeNull();
});

test('says scheduled on a run day', () => {
  mockedProgram.mockReturnValue(
    program({ schedule: { days: [0, 1, 2, 3, 4, 5, 6], startDay: null } })
  );
  render(<RunProgramBanner date={today} onStart={jest.fn()} />);
  expect(screen.getByText(/Scheduled Today/)).toBeTruthy();
});

test('is not shown for another day, after a workout today, or with the program off', () => {
  const { rerender } = render(
    <RunProgramBanner date="2020-01-01" onStart={jest.fn()} />
  );
  expect(screen.queryByTestId('run-program-banner')).toBeNull();

  mockedProgram.mockReturnValue(program({ doneDay: today }));
  rerender(<RunProgramBanner date={today} onStart={jest.fn()} />);
  expect(screen.queryByTestId('run-program-banner')).toBeNull();

  mockedProgram.mockReturnValue(program({ enabled: false }));
  rerender(<RunProgramBanner date={today} onStart={jest.fn()} />);
  expect(screen.queryByTestId('run-program-banner')).toBeNull();
});
