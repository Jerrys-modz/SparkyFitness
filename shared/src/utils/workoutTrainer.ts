import {
  splitFitsVenue,
  workoutSplitHold,
  workoutSplitLift,
  WORKOUT_SPLIT_VENUES,
  WORKOUT_SPLITS,
  type WorkoutSplit,
  type WorkoutSplitExercise,
  type WorkoutSplitGoal,
  type WorkoutSplitLevel,
  type WorkoutSplitSession,
  type WorkoutSplitVenue,
} from './workoutSplits.ts';

/**
 * The program finder: a few answers pick the closest built-in program, and the
 * person's session length and a muscle to focus on adjust it. Pure and
 * deterministic, so the server rebuilds exactly what a client previewed from
 * the same answers and no exercise list is ever sent by a client.
 */

export const TRAINER_DAYS_PER_WEEK = [3, 4, 5, 6] as const;
export const TRAINER_SESSION_MINUTES = [40, 60, 80] as const;
export type TrainerSessionMinutes = (typeof TRAINER_SESSION_MINUTES)[number];
export const DEFAULT_TRAINER_SESSION_MINUTES: TrainerSessionMinutes = 60;

export const TRAINER_FOCUSES = [
  'core',
  'chest',
  'arms',
  'shoulders',
  'legs',
] as const;
export type TrainerFocus = (typeof TRAINER_FOCUSES)[number];

export interface TrainerAnswers {
  goal: WorkoutSplitGoal;
  level: WorkoutSplitLevel;
  daysPerWeek: number;
  /** Where the person trains; a program for a smaller venue also fits. */
  venue: WorkoutSplitVenue;
}

export interface TrainerRecommendation {
  split: WorkoutSplit;
  /** Days a week the program has, minus the days asked for. */
  daysDifference: number;
  matchesGoal: boolean;
  matchesLevel: boolean;
}

const LEVEL_ORDER: readonly WorkoutSplitLevel[] = ['beginner', 'intermediate'];

/** Lower is a closer match. Days a week matter most, then level, then goal. */
function mismatch(answers: TrainerAnswers, split: WorkoutSplit): number {
  const daysGap = Math.abs(split.daysPerWeek - answers.daysPerWeek);
  // A beginner is steered away from an intermediate program more than an
  // intermediate lifter is from a beginner one.
  const levelGap =
    LEVEL_ORDER.indexOf(split.level) - LEVEL_ORDER.indexOf(answers.level);
  const levelPenalty = levelGap > 0 ? levelGap * 2 : Math.abs(levelGap);
  const goalPenalty = split.goal === answers.goal ? 0 : 1;
  const venueGap =
    WORKOUT_SPLIT_VENUES.indexOf(answers.venue) -
    WORKOUT_SPLIT_VENUES.indexOf(split.venue);
  return daysGap * 10 + levelPenalty * 3 + goalPenalty * 2 + venueGap;
}

/**
 * The programs that fit where the person trains, closest first. An empty list
 * only happens for an unknown venue.
 */
export function recommendWorkoutSplits(
  answers: TrainerAnswers,
  limit = 3
): TrainerRecommendation[] {
  return WORKOUT_SPLITS.filter((split) => splitFitsVenue(split, answers.venue))
    .map((split, index) => ({ split, index, score: mismatch(answers, split) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map(({ split }) => ({
      split,
      daysDifference: split.daysPerWeek - answers.daysPerWeek,
      matchesGoal: split.goal === answers.goal,
      matchesLevel: split.level === answers.level,
    }));
}

/** Time for one working set, rest included, and for warming up. */
const MINUTES_PER_SET = 2.5;
const WARMUP_MINUTES = 5;

/** The most working sets that fit in a session of `minutes`. */
export function setsForMinutes(minutes: number): number {
  return Math.max(0, Math.floor((minutes - WARMUP_MINUTES) / MINUTES_PER_SET));
}

/** About how long a session takes, to the nearest five minutes. */
export function estimateSessionMinutes(session: WorkoutSplitSession): number {
  const sets = session.exercises.reduce((sum, e) => sum + e.sets, 0);
  return Math.round((WARMUP_MINUTES + sets * MINUTES_PER_SET) / 5) * 5;
}

/** Which focus muscles a session trains, by session id. */
const SESSION_TRAINS: Readonly<Record<string, readonly TrainerFocus[]>> = {
  full_body_a: ['core', 'chest', 'arms', 'shoulders', 'legs'],
  full_body_b: ['core', 'chest', 'arms', 'shoulders', 'legs'],
  workout_a: ['chest', 'legs'],
  workout_b: ['shoulders', 'legs'],
  upper_a: ['chest', 'arms', 'shoulders'],
  upper_b: ['chest', 'arms', 'shoulders'],
  lower_a: ['core', 'legs'],
  lower_b: ['core', 'legs'],
  push_a: ['chest', 'arms', 'shoulders'],
  push_b: ['chest', 'arms', 'shoulders'],
  pull_a: ['arms'],
  pull_b: ['arms'],
  legs_a: ['core', 'legs'],
  legs_b: ['core', 'legs'],
  chest: ['chest'],
  back: ['arms'],
  shoulders: ['shoulders'],
  arms: ['arms'],
  legs: ['core', 'legs'],
};

type VenueTier = 'bodyweightAndDumbbells' | 'gym';

/** Exercises to add for a focus, in the order they are tried. */
const FOCUS_EXERCISES: Readonly<
  Record<TrainerFocus, Record<VenueTier, readonly WorkoutSplitExercise[]>>
> = {
  core: {
    bodyweightAndDumbbells: [
      workoutSplitHold('Plank', 3, 30),
      workoutSplitLift('Crunches', 3, 12, { to: 20 }),
      workoutSplitLift('Reverse_Crunch', 3, 12, { to: 20 }),
    ],
    gym: [
      workoutSplitLift('Cable_Crunch', 3, 10, { to: 15 }),
      workoutSplitHold('Plank', 3, 30),
      workoutSplitLift('Reverse_Crunch', 3, 12, { to: 20 }),
    ],
  },
  chest: {
    bodyweightAndDumbbells: [
      workoutSplitLift('Incline_Dumbbell_Flyes', 3, 10, { to: 14 }),
      workoutSplitLift('Dumbbell_Flyes', 3, 10, { to: 14 }),
      workoutSplitLift('Pushups', 3, 10, { to: 20 }),
    ],
    gym: [
      workoutSplitLift('Cable_Crossover', 3, 12, { to: 15 }),
      workoutSplitLift('Butterfly', 3, 10, { to: 14 }),
      workoutSplitLift('Incline_Dumbbell_Flyes', 3, 10, { to: 14 }),
    ],
  },
  arms: {
    bodyweightAndDumbbells: [
      workoutSplitLift('Concentration_Curls', 3, 10, { to: 14 }),
      workoutSplitLift('Standing_Dumbbell_Triceps_Extension', 3, 10, {
        to: 14,
      }),
      workoutSplitLift('Tricep_Dumbbell_Kickback', 3, 10, { to: 14 }),
    ],
    gym: [
      workoutSplitLift('Cable_Hammer_Curls_-_Rope_Attachment', 3, 10, {
        to: 14,
      }),
      workoutSplitLift('Triceps_Pushdown_-_Rope_Attachment', 3, 10, {
        to: 14,
      }),
      workoutSplitLift('Concentration_Curls', 3, 10, { to: 14 }),
    ],
  },
  shoulders: {
    bodyweightAndDumbbells: [
      workoutSplitLift('Front_Dumbbell_Raise', 3, 10, { to: 14 }),
      workoutSplitLift('Reverse_Flyes', 3, 12, { to: 15 }),
      workoutSplitLift('Side_Lateral_Raise', 3, 12, { to: 15 }),
    ],
    gym: [
      workoutSplitLift('Cable_Seated_Lateral_Raise', 3, 12, { to: 15 }),
      workoutSplitLift('Reverse_Machine_Flyes', 3, 12, { to: 15 }),
      workoutSplitLift('Face_Pull', 3, 12, { to: 15 }),
    ],
  },
  legs: {
    bodyweightAndDumbbells: [
      workoutSplitLift('Dumbbell_Step_Ups', 3, 8, { to: 12, lower: true }),
      workoutSplitLift('Standing_Dumbbell_Calf_Raise', 3, 12, { to: 20 }),
      workoutSplitLift('Single_Leg_Glute_Bridge', 3, 10, { to: 15 }),
    ],
    gym: [
      workoutSplitLift('Leg_Extensions', 3, 12, { to: 15 }),
      workoutSplitLift('Seated_Leg_Curl', 3, 10, { to: 14 }),
      workoutSplitLift('Standing_Calf_Raises', 3, 12, { to: 20 }),
    ],
  },
};

/** The barbell venue has a barbell but no machines, so it uses the first list. */
const tierOf = (venue: WorkoutSplitVenue): VenueTier =>
  venue === 'gym' ? 'gym' : 'bodyweightAndDumbbells';

/** The exercises a focus can add, for the equipment tier of `venue`. */
export function focusExercises(
  focus: TrainerFocus,
  venue: WorkoutSplitVenue
): readonly WorkoutSplitExercise[] {
  return FOCUS_EXERCISES[focus][tierOf(venue)];
}

/** The programs are written for about this long; shorter trims, longer adds. */
const DESIGNED_FOR_MINUTES: TrainerSessionMinutes = 60;

const MIN_EXERCISES = 3;
const MIN_SETS = 2;
const MAX_SETS = 6;
const MAIN_LIFTS = 2;

const totalSets = (exercises: readonly WorkoutSplitExercise[]): number =>
  exercises.reduce((sum, e) => sum + e.sets, 0);

/** After removing exercises, a superset group left with one member is no group. */
function tidySupersets(
  exercises: WorkoutSplitExercise[]
): WorkoutSplitExercise[] {
  const counts = new Map<number, number>();
  for (const e of exercises) {
    if (e.supersetGroup !== undefined) {
      counts.set(e.supersetGroup, (counts.get(e.supersetGroup) ?? 0) + 1);
    }
  }
  return exercises.map((e) => {
    if (e.supersetGroup === undefined || (counts.get(e.supersetGroup) ?? 0) > 1)
      return e;
    const { supersetGroup: _removed, ...rest } = e;
    return rest as WorkoutSplitExercise;
  });
}

/**
 * Shortens a session to `budget` sets: the last exercises lose sets (down to
 * two) and then go, but never the first two lifts or below three exercises.
 * Fixed-progression lifts (a linear 5x5) are never changed, because dropping a
 * set makes it a different program.
 */
function trimToBudget(
  exercises: readonly WorkoutSplitExercise[],
  budget: number
): WorkoutSplitExercise[] {
  let result = exercises.map((e) => ({ ...e }));
  while (totalSets(result) > budget) {
    let index = -1;
    for (let i = result.length - 1; i >= MAIN_LIFTS; i -= 1) {
      if (result[i].progressionMode !== 'fixed') {
        index = i;
        break;
      }
    }
    if (index < 0) break;
    const target = result[index];
    if (target.sets > MIN_SETS) {
      result[index] = { ...target, sets: target.sets - 1 };
    } else if (result.length > MIN_EXERCISES) {
      result = result.filter((_, i) => i !== index);
    } else {
      break;
    }
  }
  return tidySupersets(result);
}

/** Lets a long session do one more set of its two main lifts, within budget. */
function extendToBudget(
  exercises: readonly WorkoutSplitExercise[],
  budget: number
): WorkoutSplitExercise[] {
  const result = exercises.map((e) => ({ ...e }));
  for (let i = 0; i < Math.min(MAIN_LIFTS, result.length); i += 1) {
    const e = result[i];
    if (
      e.progressionMode !== 'fixed' &&
      e.sets < MAX_SETS &&
      totalSets(result) + 1 <= budget
    ) {
      result[i] = { ...e, sets: e.sets + 1 };
    }
  }
  return result;
}

export interface TrainerOptions {
  /** Where the person trains; picks the equipment for added exercises. */
  venue: WorkoutSplitVenue;
  sessionMinutes?: TrainerSessionMinutes;
  focus?: TrainerFocus;
}

/**
 * The program fitted to the person: every session shortened or lengthened to
 * their session length, and, for a focus muscle, one extra exercise in each
 * session that trains it (rotating through a few so sessions differ). Keeps
 * the program's id, so it is the same program, adjusted.
 */
export function applyTrainerOptions(
  split: WorkoutSplit,
  options: TrainerOptions
): WorkoutSplit {
  const minutes = options.sessionMinutes ?? DEFAULT_TRAINER_SESSION_MINUTES;
  const budget = setsForMinutes(minutes);
  const choices = options.focus
    ? focusExercises(options.focus, options.venue)
    : [];
  let used = 0;
  const sessions = split.sessions.map((session): WorkoutSplitSession => {
    let extra: WorkoutSplitExercise | undefined;
    if (
      options.focus &&
      (SESSION_TRAINS[session.id] ?? []).includes(options.focus)
    ) {
      const present = new Set(session.exercises.map((e) => e.exerciseId));
      for (let step = 0; step < choices.length; step += 1) {
        const candidate = choices[(used + step) % choices.length];
        if (!present.has(candidate.exerciseId)) {
          extra = candidate;
          used += step + 1;
          break;
        }
      }
    }
    const baseBudget = budget - (extra?.sets ?? 0);
    const base =
      totalSets(session.exercises) > baseBudget
        ? trimToBudget(session.exercises, baseBudget)
        : minutes > DESIGNED_FOR_MINUTES
          ? extendToBudget(session.exercises, baseBudget)
          : session.exercises.map((e) => ({ ...e }));
    return {
      id: session.id,
      exercises: extra ? [...base, extra] : base,
    };
  });
  return { ...split, sessions };
}
