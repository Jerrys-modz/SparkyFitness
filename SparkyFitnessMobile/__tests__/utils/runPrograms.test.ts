import {
  advanceProgress,
  findProgram,
  planMinutes,
  programStatus,
  RUN_PROGRAMS,
} from '../../src/utils/runPrograms';
import { isValidIntervalPlan } from '../../src/utils/intervals';

const program = findProgram('beginner5k')!;

describe('beginner 5K', () => {
  test('is nine weeks of three workouts', () => {
    expect(program.weeks).toBe(9);
    expect(program.workoutsPerWeek).toBe(3);
    expect(program.workouts).toHaveLength(27);
    expect(program.workouts[0]).toMatchObject({ week: 0, day: 0 });
    expect(program.workouts[26]).toMatchObject({ week: 8, day: 2 });
  });

  test('every workout is a valid plan with a warm-up and cool-down', () => {
    for (const w of program.workouts) {
      expect(isValidIntervalPlan(w.plan)).toBe(true);
      expect(w.plan.steps[0].kind).toBe('warmup');
      expect(w.plan.steps[w.plan.steps.length - 1].kind).toBe('cooldown');
    }
  });

  test('builds up to 30 minutes of running', () => {
    const run = (i: number) =>
      program.workouts[i].plan.steps
        .filter((s) => s.kind === 'work')
        .reduce((sum, s) => sum + s.seconds, 0);
    expect(run(0)).toBe(8 * 60);
    expect(run(26)).toBe(30 * 60);
    expect(planMinutes(program.workouts[26].plan)).toBe(40);
  });

  test('total running never drops from one week to the next by much', () => {
    const run = (i: number) =>
      program.workouts[i].plan.steps
        .filter((s) => s.kind === 'work')
        .reduce((sum, s) => sum + s.seconds, 0);
    for (let week = 1; week < 9; week++) {
      expect(run(week * 3 + 2)).toBeGreaterThanOrEqual(run((week - 1) * 3));
    }
  });
});

describe('progress', () => {
  test('resolves the next workout', () => {
    const status = programStatus({ programId: 'beginner5k', next: 4 })!;
    expect(status.workout).toMatchObject({ week: 1, day: 1 });
    expect(status.done).toBe(4);
    expect(status.finished).toBe(false);
  });

  test('is finished at the end and clamps a stale index', () => {
    expect(programStatus({ programId: 'beginner5k', next: 999 })).toMatchObject(
      {
        finished: true,
        workout: null,
        done: 27,
      }
    );
    expect(programStatus({ programId: 'beginner5k', next: -3 })!.done).toBe(0);
  });

  test('knows nothing of an unknown program', () => {
    expect(programStatus({ programId: 'gone', next: 0 })).toBeNull();
  });

  test('advances only past the workout that is due', () => {
    const progress = { programId: 'beginner5k', next: 2 };
    expect(advanceProgress(progress, 2).next).toBe(3);
    expect(advanceProgress(progress, 5)).toBe(progress);
    expect(advanceProgress(progress, 1)).toBe(progress);
  });
});

test('the list has a program to find', () => {
  expect(RUN_PROGRAMS.length).toBeGreaterThan(0);
});
