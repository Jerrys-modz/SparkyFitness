import type { ProgramWorkout } from "./runPrograms.ts";

/**
 * Changes to a person's run program that keep it safe: only workouts not yet
 * done are touched, running time can come down a lot but only go up a little
 * at a time, and every change says what it did. Pure, so the REST route, the
 * AI tool and tests share one set of rules.
 */

export const MAX_EASE_PERCENT = 30;
export const MAX_PUSH_PERCENT = 10;
/** The most workouts one adjustment may touch. */
export const MAX_ADJUST_WORKOUTS = 9;
const MIN_RUN_SECONDS = 15;
const MAX_RUN_SECONDS = 3600;

export interface ProgramState {
  workouts: ProgramWorkout[];
  /** Index of the next workout. */
  next: number;
}

export interface AdjustResult extends ProgramState {
  /** One line saying what changed, for the person and the change log. */
  summary: string;
}

export class ProgramAdjustError extends Error {}

const roundTo5 = (seconds: number): number => Math.round(seconds / 5) * 5;

/** Index of the first workout of `week` (0-based), or -1. */
export function firstIndexOfWeek(
  workouts: readonly ProgramWorkout[],
  week: number,
): number {
  return workouts.findIndex((w) => w.week === week);
}

/** Goes back to the start of `week` to do it again. */
export function repeatWeek(state: ProgramState, week: number): AdjustResult {
  const index = firstIndexOfWeek(state.workouts, week);
  if (index < 0) throw new ProgramAdjustError(`There is no week ${week + 1}.`);
  return {
    ...state,
    next: index,
    summary: `Repeating week ${week + 1}.`,
  };
}

/** Moves to workout `index`, clamped to the program. */
export function moveTo(state: ProgramState, index: number): AdjustResult {
  const next = Math.min(state.workouts.length, Math.max(0, Math.floor(index)));
  const workout = state.workouts[next];
  return {
    ...state,
    next,
    summary: workout
      ? `Moved to week ${workout.week + 1}, run ${workout.day + 1}.`
      : "Moved to the end of the program.",
  };
}

/**
 * Makes the running in the next `count` workouts shorter (negative `percent`)
 * or a little longer (positive), leaving the walking, warm-up and cool-down.
 * Workouts already done are never changed.
 */
export function adjustRunning(
  state: ProgramState,
  percent: number,
  count: number,
): AdjustResult {
  if (!Number.isFinite(percent) || percent === 0) {
    throw new ProgramAdjustError("Give a non-zero percent change.");
  }
  if (percent < -MAX_EASE_PERCENT || percent > MAX_PUSH_PERCENT) {
    throw new ProgramAdjustError(
      `Running time can change by ${-MAX_EASE_PERCENT}% to +${MAX_PUSH_PERCENT}% at a time.`,
    );
  }
  const n = Math.min(
    MAX_ADJUST_WORKOUTS,
    Math.max(1, Math.floor(Number.isFinite(count) ? count : 1)),
  );
  const end = Math.min(state.workouts.length, state.next + n);
  if (state.next >= state.workouts.length) {
    throw new ProgramAdjustError("The program is finished: nothing to adjust.");
  }
  const factor = 1 + percent / 100;
  const workouts = state.workouts.map((workout, index) => {
    if (index < state.next || index >= end) return workout;
    return {
      ...workout,
      plan: {
        ...workout.plan,
        steps: workout.plan.steps.map((step) =>
          step.kind === "work"
            ? {
                ...step,
                seconds: Math.min(
                  MAX_RUN_SECONDS,
                  Math.max(MIN_RUN_SECONDS, roundTo5(step.seconds * factor)),
                ),
              }
            : step,
        ),
      },
    };
  });
  const changed = end - state.next;
  return {
    workouts,
    next: state.next,
    summary: `${percent < 0 ? "Eased" : "Lengthened"} the running in the next ${changed} workout${changed === 1 ? "" : "s"} by ${Math.abs(percent)}%.`,
  };
}
