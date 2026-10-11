import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { programStatus } from '@workspace/shared';
import RunProgramBanner from '../../src/components/recording/RunProgramBanner';
import {
  useProgramDoneDay,
  useRunProgram,
} from '../../src/services/runProgramService';
import { toLocalDateString } from '../../src/utils/dateUtils';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  useProgramDoneDay: jest.fn(),
}));
let mockDays: number[] = [];
jest.mock('../../src/services/runReminderService', () => ({
  useRunReminders: () => ({ days: mockDays, hour: 7 }),
}));

const mockedProgram = jest.mocked(useRunProgram);
const mockedDone = jest.mocked(useProgramDoneDay);
const today = toLocalDateString(new Date());

const on = () =>
  mockedProgram.mockReturnValue({
    status: programStatus({ programId: 'beginner5k', next: 4 })!,
    enabled: true,
    lastAdjustment: null,
    loaded: true,
  });

beforeEach(() => {
  mockDays = [];
  mockedDone.mockReturnValue(null);
  on();
});

test("offers today's workout with a Start button", () => {
  const onStart = jest.fn();
  render(<RunProgramBanner date={today} onStart={onStart} />);
  expect(screen.getByText(/Beginner 5K •/)).toBeTruthy();
  expect(screen.getByText(/Week 2, run 2 ·/)).toBeTruthy();
  fireEvent.press(screen.getByText('Start'));
  expect(onStart).toHaveBeenCalled();
});

test('says scheduled on a run day', () => {
  mockDays = [0, 1, 2, 3, 4, 5, 6];
  render(<RunProgramBanner date={today} onStart={jest.fn()} />);
  expect(screen.getByText(/Scheduled Today/)).toBeTruthy();
});

test('is not shown for another day, after a workout today, or with the program off', () => {
  const { rerender } = render(
    <RunProgramBanner date="2020-01-01" onStart={jest.fn()} />
  );
  expect(screen.queryByTestId('run-program-banner')).toBeNull();

  mockedDone.mockReturnValue(today);
  rerender(<RunProgramBanner date={today} onStart={jest.fn()} />);
  expect(screen.queryByTestId('run-program-banner')).toBeNull();

  mockedDone.mockReturnValue(null);
  mockedProgram.mockReturnValue({
    status: programStatus({ programId: 'beginner5k', next: 4 })!,
    enabled: false,
    lastAdjustment: null,
    loaded: true,
  });
  rerender(<RunProgramBanner date={today} onStart={jest.fn()} />);
  expect(screen.queryByTestId('run-program-banner')).toBeNull();
});
