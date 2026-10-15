import type { TFunction } from 'i18next';
import {
  findProgram,
  planTotalSeconds,
  type IntervalPlan,
} from '@workspace/shared';
import { programDoneCue, programStartCue } from './recordingCues';

/** Total running (work) time in a plan. */
const workSeconds = (plan: IntervalPlan): number =>
  plan.steps.reduce(
    (sum, step) => sum + (step.kind === 'work' ? step.seconds : 0),
    0
  );

export interface ProgramSpokenCues {
  /** Said ahead of the first step: where this sits in the program, its length, and any easing. */
  start: string;
  /** Said at the end of a workout that reached its last step: progress and what is next. */
  done: string;
}

/**
 * The two sentences a program workout adds to the voice coach, already in the
 * app language so the watch can speak them as they are. `plan` is the
 * person's stored copy, which can be shorter than the original if the running
 * was eased. Null when the program or workout is not known.
 */
export function programSpokenCues(
  t: TFunction,
  program: { id: string; index: number },
  plan: IntervalPlan
): ProgramSpokenCues | null {
  const definition = findProgram(program.id);
  const workout = definition?.workouts[program.index];
  if (!definition || !workout) return null;
  const next = definition.workouts[program.index + 1];
  return {
    start: programStartCue(t, {
      activity: definition.activity,
      week: workout.week + 1,
      day: workout.day + 1,
      totalSeconds: planTotalSeconds(plan),
      // Running time was cut by a tenth or more from the original plan.
      eased: workSeconds(plan) <= workSeconds(workout.plan) * 0.9,
    }),
    done: programDoneCue(t, {
      activity: definition.activity,
      done: program.index + 1,
      total: definition.workouts.length,
      next: next ? { week: next.week + 1, day: next.day + 1 } : null,
    }),
  };
}
