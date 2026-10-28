import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { ProgramStatus, RunProgram } from '@workspace/shared';
import RecommendedTodayCard from '../../src/components/recording/RecommendedTodayCard';

const mockUseTrainingLoad = jest.fn();
jest.mock('../../src/hooks/useTrainingLoad', () => ({
  useTrainingLoad: () => mockUseTrainingLoad(),
}));
const mockUseSuggestedRanges = jest.fn();
jest.mock('../../src/hooks/useSuggestedRanges', () => ({
  useSuggestedRanges: (...args: unknown[]) => mockUseSuggestedRanges(...args),
}));

const band = (min: number, max: number) => ({
  minSecondsPerKm: min,
  maxSecondsPerKm: max,
});

const program = (activity: 'run' | 'walk' = 'run'): RunProgram =>
  ({
    id: 'faster5k',
    activity,
    weeks: 1,
    workoutsPerWeek: 1,
    workouts: [],
  }) as unknown as RunProgram;

const statusFor = (
  steps: ProgramStatus['workout'] extends infer W
    ? W extends { plan: { steps: infer S } }
      ? S
      : never
    : never,
  finished = false
): ProgramStatus => ({
  program: program(),
  workout: {
    week: 1,
    day: 2,
    plan: { style: 'fastEasy', steps },
  } as ProgramStatus['workout'],
  done: 4,
  total: 27,
  finished,
});

const tempoSteps = [
  { kind: 'warmup', seconds: 600 },
  { kind: 'work', seconds: 1200, effort: 'tempo' },
  { kind: 'cooldown', seconds: 600 },
] as never;

beforeEach(() => {
  mockUseTrainingLoad.mockReturnValue({
    load: { status: 'steady', recovery: 'ready' },
  });
  mockUseSuggestedRanges.mockReturnValue({
    pace: { work: band(270, 290), easy: band(330, 350), warm: band(340, 380) },
    byEffort: { tempo: band(295, 305) },
    heartRate: null,
  });
});

describe('RecommendedTodayCard', () => {
  it('shows the session with each part, its zone and pace, and why it fits', () => {
    render(
      <RecommendedTodayCard status={statusFor(tempoSteps)} distanceUnit="km" />
    );
    expect(screen.getByText('Recommended today')).toBeTruthy();
    // Once as the session's name and once as its main step.
    expect(screen.getAllByText('Tempo')).toHaveLength(2);
    expect(screen.getByText('40 min')).toBeTruthy();
    expect(
      screen.getByText(
        'You are rested, and your load has room for this session.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Easy warm-up')).toBeTruthy();
    // The warm-up and the cool-down share a range.
    expect(screen.getAllByText('Zone 2 · about 6:00/km')).toHaveLength(2);
    expect(screen.getByText('Zone 3 · about 5:00/km')).toBeTruthy();
    expect(screen.getByText('Easy cool-down')).toBeTruthy();
  });

  it('quotes the pace per mile in miles', () => {
    render(
      <RecommendedTodayCard
        status={statusFor(tempoSteps)}
        distanceUnit="miles"
      />
    );
    // 300 s per km is about 8:03 per mile, rounded to 5 s.
    expect(screen.getByText('Zone 3 · about 8:05/mi')).toBeTruthy();
  });

  it('leaves the reason out while there is no load history', () => {
    mockUseTrainingLoad.mockReturnValue({
      load: { status: 'noData', recovery: 'ok' },
    });
    render(
      <RecommendedTodayCard status={statusFor(tempoSteps)} distanceUnit="km" />
    );
    expect(screen.queryByText(/load/i)).toBeNull();
  });

  it('shows only the zone with no pace ranges', () => {
    mockUseSuggestedRanges.mockReturnValue({
      pace: null,
      byEffort: null,
      heartRate: null,
    });
    render(
      <RecommendedTodayCard status={statusFor(tempoSteps)} distanceUnit="km" />
    );
    expect(screen.getAllByText('Zone 2').length).toBe(2);
    expect(screen.getByText('Zone 3')).toBeTruthy();
  });

  it('renders nothing once the program is finished', () => {
    render(
      <RecommendedTodayCard
        status={statusFor(tempoSteps, true)}
        distanceUnit="km"
      />
    );
    expect(screen.queryByTestId('recommended-today')).toBeNull();
  });
});
