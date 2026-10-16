import type { TFunction } from 'i18next';
import {
  type ProgramStatus,
  type ProgramWorkout,
  type RunProgram,
  type RunProgramResponse,
  type UpsertRunProgramBody,
} from '@workspace/shared';
import { PROGRAM_COPY } from '@/constants/runProgramCopy';

/** A built-in program's name; an unknown id reads as itself. */
export const programName = (t: TFunction, id: string): string =>
  t(`trainingPrograms.programs.${id}.name`, PROGRAM_COPY[id]?.name ?? id);

export const programDescription = (t: TFunction, id: string): string =>
  t(
    `trainingPrograms.programs.${id}.description`,
    PROGRAM_COPY[id]?.description ?? ''
  );

/** What a program's weeks look like. */
export const programStructure = (t: TFunction, id: string): string =>
  t(
    `trainingPrograms.programs.${id}.structure`,
    PROGRAM_COPY[id]?.structure ?? ''
  );

/** A program's name: the person's own for a custom one, else the built-in's. */
export const programTitle = (t: TFunction, program: RunProgram): string =>
  program.custom?.name || programName(t, program.id);

/** "Workout 4" or the person's own name for a workout of a custom program. */
export const customWorkoutTitle = (
  t: TFunction,
  workout: ProgramWorkout
): string =>
  workout.title ||
  t('trainingPrograms.workout.number', 'Workout {{number}}', {
    number: workout.week * 7 + workout.day + 1,
  });

/** "Week 3, run 2" for a workout of `program`, without the program's name. */
export const workoutTitle = (
  t: TFunction,
  program: RunProgram,
  workout: ProgramWorkout
): string => {
  if (program.custom) return customWorkoutTitle(t, workout);
  if (program.activity === 'walk') {
    return t(
      'trainingPrograms.workout.titleWalk',
      'Week {{week}}, walk {{walk}}',
      {
        week: workout.week + 1,
        walk: workout.day + 1,
      }
    );
  }
  return t('trainingPrograms.workout.titleRun', 'Week {{week}}, run {{run}}', {
    week: workout.week + 1,
    run: workout.day + 1,
  });
};

/** The program's name and the workout due, or just its name when finished. */
export const programWorkoutLabel = (
  t: TFunction,
  status: ProgramStatus
): string =>
  status.workout
    ? t('trainingPrograms.workout.label', '{{name}} · {{workout}}', {
        name: programTitle(t, status.program),
        workout: workoutTitle(t, status.program, status.workout),
      })
    : programTitle(t, status.program);

/** A calendar day (YYYY-MM-DD) as text, e.g. "Mon, Oct 19". */
export const formatDayLabel = (
  day: string,
  locale: string,
  style: 'long' | 'short' = 'short'
): string => {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: style,
    month: style,
    day: 'numeric',
    timeZone: 'UTC',
  });
};

// --- Request bodies for the actions on the card -----------------------------
// Each change is one PUT /api/v2/run-program with only the fields that move,
// built from the program as the server holds it.

/** Starts `programId` from its first workout and switches it on. */
export const startProgramBody = (
  programId: string,
  startDay?: string | null
): UpsertRunProgramBody => ({
  program_id: programId,
  enabled: true,
  start_date: startDay,
});

export const setEnabledBody = (
  program: RunProgramResponse,
  enabled: boolean
): UpsertRunProgramBody => ({ program_id: program.program_id, enabled });

/** Jumps to any workout (0-based), to repeat one or start further in. */
export const setPositionBody = (
  program: RunProgramResponse,
  index: number
): UpsertRunProgramBody => ({
  program_id: program.program_id,
  next_index: Math.max(0, Math.floor(index)),
});

export const skipWorkoutBody = (
  program: RunProgramResponse
): UpsertRunProgramBody => setPositionBody(program, program.next_index + 1);

export const restartBody = (
  program: RunProgramResponse
): UpsertRunProgramBody => setPositionBody(program, 0);

/** Flips one weekday (0 = Sunday) on the days the server has now. */
export const toggleDayBody = (
  program: RunProgramResponse,
  day: number
): UpsertRunProgramBody => ({
  program_id: program.program_id,
  run_days: program.run_days.includes(day)
    ? program.run_days.filter((d) => d !== day)
    : [...program.run_days, day].sort((a, b) => a - b),
});

/** null clears a day; omitting a field leaves it as it is. */
export const scheduleBody = (
  program: RunProgramResponse,
  change: { startDay?: string | null; endDay?: string | null }
): UpsertRunProgramBody => ({
  program_id: program.program_id,
  ...(change.startDay !== undefined && { start_date: change.startDay }),
  ...(change.endDay !== undefined && { end_date: change.endDay }),
});
