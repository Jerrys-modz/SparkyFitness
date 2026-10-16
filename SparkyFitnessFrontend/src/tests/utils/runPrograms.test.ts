import type { TFunction } from 'i18next';
import { findProgram, storedProgramStatus } from '@workspace/shared';
import { translateForTest } from '@/tests/mocks/reactI18next';
import { makeRunProgram } from '@/tests/mocks/runProgramFixture';
import {
  formatDayLabel,
  programDescription,
  programName,
  programStructure,
  programTitle,
  programWorkoutLabel,
  restartBody,
  scheduleBody,
  setEnabledBody,
  setPositionBody,
  skipWorkoutBody,
  startProgramBody,
  toggleDayBody,
  workoutTitle,
} from '@/utils/runPrograms';
import { PROGRAM_COPY } from '@/constants/runProgramCopy';
import { RUN_PROGRAMS } from '@workspace/shared';

const t = translateForTest as unknown as TFunction;

describe('program copy', () => {
  it('has a name, description and structure for every built-in program', () => {
    for (const program of RUN_PROGRAMS) {
      const copy = PROGRAM_COPY[program.id];
      expect(copy?.name).toBeTruthy();
      expect(copy?.description).toBeTruthy();
      expect(copy?.structure).toBeTruthy();
    }
  });

  it('reads the English defaults', () => {
    expect(programName(t, 'beginner5k')).toBe('Beginner 5K');
    expect(programName(t, 'halfMarathon4')).toBe(
      'Half marathon (4 runs a week)'
    );
    expect(programDescription(t, 'walkFit')).toContain('Walk for fitness');
    expect(programStructure(t, 'beginner5k')).toContain('Weeks 1 to 4');
  });

  it('falls back to the id for a program that is gone', () => {
    expect(programName(t, 'retired')).toBe('retired');
    expect(programDescription(t, 'retired')).toBe('');
  });
});

describe('labels', () => {
  const run = storedProgramStatus(makeRunProgram());

  it('labels a run workout by week and run', () => {
    const workout = run.program.workouts[4]!;
    expect(workoutTitle(t, run.program, workout)).toBe(
      `Week ${workout.week + 1}, run ${workout.day + 1}`
    );
  });

  it('labels a walking program workout as a walk', () => {
    const walk = storedProgramStatus(
      makeRunProgram({
        program_id: 'walkFit',
        workouts: findProgram('walkFit')!.workouts,
      })
    );
    expect(workoutTitle(t, walk.program, walk.program.workouts[0]!)).toBe(
      'Week 1, walk 1'
    );
  });

  it("uses the person's own names for a custom program", () => {
    const custom = storedProgramStatus(
      makeRunProgram({
        program_id: 'custom:abc',
        name: 'Spring plan',
        workouts: [
          { ...findProgram('beginner5k')!.workouts[0]!, title: 'Long one' },
          findProgram('beginner5k')!.workouts[1]!,
        ],
      })
    );
    expect(programTitle(t, custom.program)).toBe('Spring plan');
    expect(workoutTitle(t, custom.program, custom.program.workouts[0]!)).toBe(
      'Long one'
    );
    expect(workoutTitle(t, custom.program, custom.program.workouts[1]!)).toBe(
      'Workout 2'
    );
    expect(programWorkoutLabel(t, custom)).toBe('Spring plan · Long one');
  });

  it('names the program alone once it is finished', () => {
    const done = storedProgramStatus(makeRunProgram({ next_index: 27 }));
    expect(done.finished).toBe(true);
    expect(programWorkoutLabel(t, done)).toBe('Beginner 5K');
  });

  it('formats a calendar day without shifting it across a timezone', () => {
    expect(formatDayLabel('2026-10-19', 'en-US', 'long')).toBe(
      'Monday, October 19'
    );
    expect(formatDayLabel('2026-10-19', 'en-US')).toBe('Mon, Oct 19');
    expect(formatDayLabel('nope', 'en-US')).toBe('nope');
  });
});

describe('request bodies', () => {
  const program = makeRunProgram({ next_index: 3, run_days: [1, 5] });

  it('starts from the first workout, switched on', () => {
    expect(startProgramBody('faster5k')).toEqual({
      program_id: 'faster5k',
      enabled: true,
      start_date: undefined,
    });
    expect(startProgramBody('faster5k', '2026-11-02').start_date).toBe(
      '2026-11-02'
    );
    expect(startProgramBody('faster5k', null).start_date).toBeNull();
  });

  it('switches on and off keeping the place', () => {
    expect(setEnabledBody(program, false)).toEqual({
      program_id: 'beginner5k',
      enabled: false,
    });
  });

  it('moves the place', () => {
    expect(skipWorkoutBody(program).next_index).toBe(4);
    expect(restartBody(program).next_index).toBe(0);
    expect(setPositionBody(program, 12).next_index).toBe(12);
    expect(setPositionBody(program, -3).next_index).toBe(0);
    expect(setPositionBody(program, 2.9).next_index).toBe(2);
  });

  it('flips a weekday on the days the server has, keeping them sorted', () => {
    expect(toggleDayBody(program, 3).run_days).toEqual([1, 3, 5]);
    expect(toggleDayBody(program, 0).run_days).toEqual([0, 1, 5]);
    expect(toggleDayBody(program, 1).run_days).toEqual([5]);
  });

  it('sends only the schedule fields that change', () => {
    expect(scheduleBody(program, { startDay: '2026-11-02' })).toEqual({
      program_id: 'beginner5k',
      start_date: '2026-11-02',
    });
    expect(scheduleBody(program, { endDay: null })).toEqual({
      program_id: 'beginner5k',
      end_date: null,
    });
    expect(scheduleBody(program, {})).toEqual({ program_id: 'beginner5k' });
  });
});
