import type { ProgressionMode } from '../types/progression.ts';

/**
 * Ready-made strength splits for people starting out. Pure data: the app owns
 * the names and descriptions (translation keys are the split and session ids),
 * and importing a split into a person's presets and plan is done by the server.
 */

/** Every exercise in a split is a free-exercise-db id, never a name. */
export const WORKOUT_SPLIT_EXERCISE_SOURCE = 'free-exercise-db';

export type WorkoutSplitLevel = 'beginner' | 'intermediate';

interface WorkoutSplitExerciseBase {
  /** free-exercise-db id, saved as the library exercise's `source_id`. */
  exerciseId: string;
  sets: number;
  progressionMode: ProgressionMode;
  /** How much heavier the next session is after a progression, in kg. */
  incrementKg: number;
  /** Exercises sharing a number are done back to back. */
  supersetGroup?: number;
}

/** Counted in reps; `reps` is the bottom of the range when `repGoal` is set. */
export interface WorkoutSplitRepsExercise extends WorkoutSplitExerciseBase {
  reps: number;
  /** Top of the rep range: reaching it on every set earns a heavier load. */
  repGoal?: number;
  durationSeconds?: never;
}

/** A hold, such as a plank, timed in seconds per set. */
export interface WorkoutSplitTimedExercise extends WorkoutSplitExerciseBase {
  durationSeconds: number;
  reps?: never;
  repGoal?: never;
}

export type WorkoutSplitExercise =
  WorkoutSplitRepsExercise | WorkoutSplitTimedExercise;

export interface WorkoutSplitSession {
  /** Stable id, also the translation key suffix. */
  id: string;
  exercises: WorkoutSplitExercise[];
}

export const WORKOUT_SPLIT_VENUES = ['home', 'garage', 'gym'] as const;
/**
 * Where a split can be done, by the equipment it needs. `home` is dumbbells,
 * a bench and a pull-up bar; `garage` adds a barbell and squat rack; `gym`
 * adds machines and cables. Each venue can also do the ones before it.
 */
export type WorkoutSplitVenue = (typeof WORKOUT_SPLIT_VENUES)[number];

export const WORKOUT_SPLIT_GOALS = ['muscle', 'strength'] as const;
export type WorkoutSplitGoal = (typeof WORKOUT_SPLIT_GOALS)[number];

export interface WorkoutSplit {
  /** Stable id, also the translation key suffix. */
  id: string;
  level: WorkoutSplitLevel;
  goal: WorkoutSplitGoal;
  venue: WorkoutSplitVenue;
  daysPerWeek: number;
  /** Done in order, then round again, like a sequential workout plan. */
  sessions: WorkoutSplitSession[];
}

/** Whether someone training at `venue` has what the split needs. */
export function splitFitsVenue(
  split: WorkoutSplit,
  venue: WorkoutSplitVenue
): boolean {
  return (
    WORKOUT_SPLIT_VENUES.indexOf(split.venue) <=
    WORKOUT_SPLIT_VENUES.indexOf(venue)
  );
}

const UPPER_INCREMENT_KG = 2.5;
const LOWER_INCREMENT_KG = 5;

interface LiftOptions {
  /** Top of the rep range, for double progression. */
  to?: number;
  /** Fixed reps every session, adding weight each time (linear progression). */
  linear?: boolean;
  /** Heavier jumps for the big lower-body lifts. */
  lower?: boolean;
  superset?: number;
}

/** One exercise: `sets` x `reps`, progressing by rep goal unless `linear`. */
function lift(
  exerciseId: string,
  sets: number,
  reps: number,
  options: LiftOptions = {}
): WorkoutSplitRepsExercise {
  const lower = options.lower ?? false;
  return {
    exerciseId,
    sets,
    reps,
    ...(options.to ? { repGoal: options.to } : {}),
    progressionMode: options.linear ? 'fixed' : 'rep_goal',
    incrementKg: lower ? LOWER_INCREMENT_KG : UPPER_INCREMENT_KG,
    ...(options.superset ? { supersetGroup: options.superset } : {}),
  };
}

/** A hold of `seconds` per set, progressed by hand. */
function hold(
  exerciseId: string,
  sets: number,
  seconds: number
): WorkoutSplitTimedExercise {
  return {
    exerciseId,
    sets,
    durationSeconds: seconds,
    progressionMode: 'manual',
    incrementKg: 0,
  };
}

/** The builders the trainer uses for the exercises it adds to a program. */
export { lift as workoutSplitLift, hold as workoutSplitHold };

const SQUAT = 'Barbell_Squat';
const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';
const ROW = 'Bent_Over_Barbell_Row';
const DEADLIFT = 'Barbell_Deadlift';
const OVERHEAD_PRESS = 'Standing_Military_Press';
const ROMANIAN_DEADLIFT = 'Romanian_Deadlift';
const INCLINE_DB_PRESS = 'Incline_Dumbbell_Press';
const DB_SHOULDER_PRESS = 'Dumbbell_Shoulder_Press';
const LATERAL_RAISE = 'Side_Lateral_Raise';
const TRICEPS_PUSHDOWN = 'Triceps_Pushdown';
const LAT_PULLDOWN = 'Wide-Grip_Lat_Pulldown';
const CABLE_ROW = 'Seated_Cable_Rows';
const FACE_PULL = 'Face_Pull';
const BARBELL_CURL = 'Barbell_Curl';
const HAMMER_CURL = 'Hammer_Curls';
const LEG_PRESS = 'Leg_Press';
const LEG_CURL = 'Lying_Leg_Curls';
const LEG_EXTENSION = 'Leg_Extensions';
const CALF_RAISE = 'Standing_Calf_Raises';
const DB_BENCH = 'Dumbbell_Bench_Press';
const ONE_ARM_ROW = 'One-Arm_Dumbbell_Row';
const DB_SQUAT = 'Dumbbell_Squat';
const PULL_UPS = 'Pullups';
const CABLE_CROSSOVER = 'Cable_Crossover';
const DUMBBELL_FLYES = 'Dumbbell_Flyes';
const SKULL_CRUSHER = 'EZ-Bar_Skullcrusher';
const HIP_THRUST = 'Barbell_Hip_Thrust';
const LUNGE = 'Dumbbell_Lunges';
const PLANK = 'Plank';

const PUSH_UPS = 'Pushups';
const CHIN_UP = 'Chin-Up';
const DB_ROMANIAN_DEADLIFT = 'Stiff-Legged_Dumbbell_Deadlift';
const DB_ROW = 'Bent_Over_Two-Dumbbell_Row';
const SPLIT_SQUAT = 'Split_Squat_with_Dumbbells';
const STEP_UP = 'Dumbbell_Step_Ups';
const DB_CURL = 'Dumbbell_Bicep_Curl';
const DB_TRICEPS_EXTENSION = 'Standing_Dumbbell_Triceps_Extension';
const DB_KICKBACK = 'Tricep_Dumbbell_Kickback';
const REVERSE_FLYES = 'Reverse_Flyes';
const DB_CALF_RAISE = 'Standing_Dumbbell_Calf_Raise';
const SINGLE_LEG_BRIDGE = 'Single_Leg_Glute_Bridge';
const CLOSE_GRIP_BENCH = 'Close-Grip_Barbell_Bench_Press';
const FRONT_SQUAT = 'Front_Barbell_Squat';
const BARBELL_CALF_RAISE = 'Standing_Barbell_Calf_Raise';

const FULL_BODY_A: WorkoutSplitSession = {
  id: 'full_body_a',
  exercises: [
    lift(DB_SQUAT, 3, 8, { to: 12, lower: true }),
    lift(DB_BENCH, 3, 8, { to: 12 }),
    lift(CABLE_ROW, 3, 8, { to: 12 }),
    lift(DB_SHOULDER_PRESS, 2, 8, { to: 12 }),
    hold(PLANK, 3, 30),
  ],
};

const FULL_BODY_B: WorkoutSplitSession = {
  id: 'full_body_b',
  exercises: [
    lift(ROMANIAN_DEADLIFT, 3, 8, { to: 12, lower: true }),
    lift(INCLINE_DB_PRESS, 3, 8, { to: 12 }),
    lift(LAT_PULLDOWN, 3, 8, { to: 12 }),
    lift(LUNGE, 2, 10, { to: 14, lower: true }),
    lift(BARBELL_CURL, 2, 10, { to: 14 }),
  ],
};

const UPPER_A: WorkoutSplitSession = {
  id: 'upper_a',
  exercises: [
    lift(BENCH, 4, 6, { to: 8 }),
    lift(ROW, 4, 6, { to: 8 }),
    lift(OVERHEAD_PRESS, 3, 8, { to: 10 }),
    lift(LAT_PULLDOWN, 3, 8, { to: 12 }),
    lift(BARBELL_CURL, 2, 10, { to: 12, superset: 1 }),
    lift(TRICEPS_PUSHDOWN, 2, 10, { to: 12, superset: 1 }),
  ],
};

const LOWER_A: WorkoutSplitSession = {
  id: 'lower_a',
  exercises: [
    lift(SQUAT, 4, 6, { to: 8, lower: true }),
    lift(ROMANIAN_DEADLIFT, 3, 8, { to: 10, lower: true }),
    lift(LEG_PRESS, 3, 10, { to: 14, lower: true }),
    lift(LEG_CURL, 3, 10, { to: 14 }),
    lift(CALF_RAISE, 4, 10, { to: 15 }),
  ],
};

const UPPER_B: WorkoutSplitSession = {
  id: 'upper_b',
  exercises: [
    lift(OVERHEAD_PRESS, 4, 6, { to: 8 }),
    lift(PULL_UPS, 4, 6, { to: 10 }),
    lift(INCLINE_DB_PRESS, 3, 8, { to: 12 }),
    lift(CABLE_ROW, 3, 8, { to: 12 }),
    lift(LATERAL_RAISE, 3, 12, { to: 15 }),
    lift(HAMMER_CURL, 2, 10, { to: 12, superset: 1 }),
    lift(SKULL_CRUSHER, 2, 10, { to: 12, superset: 1 }),
  ],
};

const LOWER_B: WorkoutSplitSession = {
  id: 'lower_b',
  exercises: [
    lift(DEADLIFT, 3, 5, { to: 6, lower: true }),
    lift(LEG_PRESS, 3, 10, { to: 14, lower: true }),
    lift(HIP_THRUST, 3, 8, { to: 12, lower: true }),
    lift(LEG_EXTENSION, 3, 12, { to: 15 }),
    lift(CALF_RAISE, 4, 10, { to: 15 }),
  ],
};

const PUSH_A: WorkoutSplitSession = {
  id: 'push_a',
  exercises: [
    lift(BENCH, 4, 6, { to: 8 }),
    lift(OVERHEAD_PRESS, 3, 8, { to: 10 }),
    lift(INCLINE_DB_PRESS, 3, 8, { to: 12 }),
    lift(LATERAL_RAISE, 3, 12, { to: 15 }),
    lift(TRICEPS_PUSHDOWN, 3, 10, { to: 14 }),
  ],
};

const PULL_A: WorkoutSplitSession = {
  id: 'pull_a',
  exercises: [
    lift(ROW, 4, 6, { to: 8 }),
    lift(PULL_UPS, 3, 6, { to: 10 }),
    lift(CABLE_ROW, 3, 8, { to: 12 }),
    lift(FACE_PULL, 3, 12, { to: 15 }),
    lift(BARBELL_CURL, 3, 8, { to: 12 }),
  ],
};

const LEGS_A: WorkoutSplitSession = {
  id: 'legs_a',
  exercises: [
    lift(SQUAT, 4, 6, { to: 8, lower: true }),
    lift(ROMANIAN_DEADLIFT, 3, 8, { to: 10, lower: true }),
    lift(LEG_PRESS, 3, 10, { to: 14, lower: true }),
    lift(LEG_CURL, 3, 10, { to: 14 }),
    lift(CALF_RAISE, 4, 10, { to: 15 }),
  ],
};

const PUSH_B: WorkoutSplitSession = {
  id: 'push_b',
  exercises: [
    lift(OVERHEAD_PRESS, 4, 6, { to: 8 }),
    lift(DB_BENCH, 3, 8, { to: 12 }),
    lift(CABLE_CROSSOVER, 3, 12, { to: 15 }),
    lift(LATERAL_RAISE, 3, 12, { to: 15 }),
    lift(SKULL_CRUSHER, 3, 10, { to: 12 }),
  ],
};

const PULL_B: WorkoutSplitSession = {
  id: 'pull_b',
  exercises: [
    lift(DEADLIFT, 3, 5, { to: 6, lower: true }),
    lift(LAT_PULLDOWN, 3, 8, { to: 12 }),
    lift(ONE_ARM_ROW, 3, 8, { to: 12 }),
    lift(FACE_PULL, 3, 12, { to: 15 }),
    lift(HAMMER_CURL, 3, 10, { to: 12 }),
  ],
};

const LEGS_B: WorkoutSplitSession = {
  id: 'legs_b',
  exercises: [
    lift(LEG_PRESS, 4, 8, { to: 12, lower: true }),
    lift(HIP_THRUST, 3, 8, { to: 12, lower: true }),
    lift(LUNGE, 3, 10, { to: 14, lower: true }),
    lift(LEG_EXTENSION, 3, 12, { to: 15 }),
    lift(CALF_RAISE, 4, 10, { to: 15 }),
  ],
};

export const WORKOUT_SPLITS: readonly WorkoutSplit[] = [
  {
    // Light, machine- and dumbbell-friendly full body days to learn the lifts.
    id: 'full_body_3',
    level: 'beginner',
    goal: 'muscle',
    venue: 'gym',
    daysPerWeek: 3,
    sessions: [FULL_BODY_A, FULL_BODY_B],
  },
  {
    // Five sets of five on the big barbell lifts, a little heavier each time.
    id: 'linear_5x5',
    level: 'beginner',
    goal: 'strength',
    venue: 'garage',
    daysPerWeek: 3,
    sessions: [
      {
        id: 'workout_a',
        exercises: [
          lift(SQUAT, 5, 5, { linear: true, lower: true }),
          lift(BENCH, 5, 5, { linear: true }),
          lift(ROW, 5, 5, { linear: true }),
        ],
      },
      {
        id: 'workout_b',
        exercises: [
          lift(SQUAT, 5, 5, { linear: true, lower: true }),
          lift(OVERHEAD_PRESS, 5, 5, { linear: true }),
          lift(DEADLIFT, 1, 5, { linear: true, lower: true }),
        ],
      },
    ],
  },
  {
    id: 'upper_lower_4',
    level: 'beginner',
    goal: 'muscle',
    venue: 'gym',
    daysPerWeek: 4,
    sessions: [UPPER_A, LOWER_A, UPPER_B, LOWER_B],
  },
  {
    // One pass through push, pull and legs, repeated across the week.
    id: 'push_pull_legs_3',
    level: 'beginner',
    goal: 'muscle',
    venue: 'gym',
    daysPerWeek: 3,
    sessions: [PUSH_A, PULL_A, LEGS_A],
  },
  {
    id: 'push_pull_legs_6',
    level: 'intermediate',
    goal: 'muscle',
    venue: 'gym',
    daysPerWeek: 6,
    sessions: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B],
  },
  {
    id: 'body_part_5',
    level: 'intermediate',
    goal: 'muscle',
    venue: 'gym',
    daysPerWeek: 5,
    sessions: [
      {
        id: 'chest',
        exercises: [
          lift(BENCH, 4, 6, { to: 8 }),
          lift(INCLINE_DB_PRESS, 3, 8, { to: 12 }),
          lift(DUMBBELL_FLYES, 3, 10, { to: 14 }),
          lift(CABLE_CROSSOVER, 3, 12, { to: 15 }),
        ],
      },
      {
        id: 'back',
        exercises: [
          lift(DEADLIFT, 3, 5, { to: 6, lower: true }),
          lift(PULL_UPS, 4, 6, { to: 10 }),
          lift(ROW, 3, 8, { to: 10 }),
          lift(CABLE_ROW, 3, 10, { to: 14 }),
        ],
      },
      {
        id: 'shoulders',
        exercises: [
          lift(OVERHEAD_PRESS, 4, 6, { to: 8 }),
          lift(LATERAL_RAISE, 4, 12, { to: 15 }),
          lift(FACE_PULL, 3, 12, { to: 15 }),
        ],
      },
      {
        id: 'arms',
        exercises: [
          lift(BARBELL_CURL, 3, 8, { to: 12 }),
          lift(SKULL_CRUSHER, 3, 8, { to: 12 }),
          lift(HAMMER_CURL, 3, 10, { to: 12 }),
          lift(TRICEPS_PUSHDOWN, 3, 10, { to: 14 }),
        ],
      },
      {
        id: 'legs',
        exercises: [
          lift(SQUAT, 4, 6, { to: 8, lower: true }),
          lift(ROMANIAN_DEADLIFT, 3, 8, { to: 10, lower: true }),
          lift(LEG_PRESS, 3, 10, { to: 14, lower: true }),
          lift(LEG_CURL, 3, 10, { to: 14 }),
          lift(CALF_RAISE, 4, 10, { to: 15 }),
        ],
      },
    ],
  },
  {
    id: 'full_body_3_garage',
    level: 'beginner',
    goal: 'muscle',
    venue: 'garage',
    daysPerWeek: 3,
    sessions: [
      {
        id: 'full_body_a',
        exercises: [
          lift(SQUAT, 3, 8, { to: 10, lower: true }),
          lift(BENCH, 3, 8, { to: 10 }),
          lift(ROW, 3, 8, { to: 10 }),
          lift(BARBELL_CURL, 2, 10, { to: 12 }),
          hold(PLANK, 3, 30),
        ],
      },
      {
        id: 'full_body_b',
        exercises: [
          lift(ROMANIAN_DEADLIFT, 3, 8, { to: 10, lower: true }),
          lift(OVERHEAD_PRESS, 3, 8, { to: 10 }),
          lift(PULL_UPS, 3, 5, { to: 10 }),
          lift(LUNGE, 2, 10, { to: 14, lower: true }),
          lift(CLOSE_GRIP_BENCH, 2, 8, { to: 12 }),
        ],
      },
    ],
  },
  {
    id: 'upper_lower_4_garage',
    level: 'beginner',
    goal: 'muscle',
    venue: 'garage',
    daysPerWeek: 4,
    sessions: [
      {
        id: 'upper_a',
        exercises: [
          lift(BENCH, 4, 6, { to: 8 }),
          lift(ROW, 4, 6, { to: 8 }),
          lift(OVERHEAD_PRESS, 3, 8, { to: 10 }),
          lift(PULL_UPS, 3, 5, { to: 10 }),
          lift(BARBELL_CURL, 2, 10, { to: 12, superset: 1 }),
          lift(CLOSE_GRIP_BENCH, 2, 8, { to: 12, superset: 1 }),
        ],
      },
      {
        id: 'lower_a',
        exercises: [
          lift(SQUAT, 4, 6, { to: 8, lower: true }),
          lift(ROMANIAN_DEADLIFT, 3, 8, { to: 10, lower: true }),
          lift(LUNGE, 3, 10, { to: 14, lower: true }),
          lift(BARBELL_CALF_RAISE, 4, 10, { to: 15 }),
          hold(PLANK, 3, 30),
        ],
      },
      {
        id: 'upper_b',
        exercises: [
          lift(OVERHEAD_PRESS, 4, 6, { to: 8 }),
          lift(CHIN_UP, 4, 5, { to: 10 }),
          lift(INCLINE_DB_PRESS, 3, 8, { to: 12 }),
          lift(ONE_ARM_ROW, 3, 8, { to: 12 }),
          lift(LATERAL_RAISE, 3, 12, { to: 15 }),
          lift(HAMMER_CURL, 2, 10, { to: 12 }),
        ],
      },
      {
        id: 'lower_b',
        exercises: [
          lift(DEADLIFT, 3, 5, { to: 6, lower: true }),
          lift(FRONT_SQUAT, 3, 6, { to: 8, lower: true }),
          lift(HIP_THRUST, 3, 8, { to: 12, lower: true }),
          lift(SPLIT_SQUAT, 3, 10, { to: 14, lower: true }),
          lift(BARBELL_CALF_RAISE, 4, 10, { to: 15 }),
        ],
      },
    ],
  },
  {
    id: 'push_pull_legs_3_garage',
    level: 'beginner',
    goal: 'muscle',
    venue: 'garage',
    daysPerWeek: 3,
    sessions: [
      {
        id: 'push_a',
        exercises: [
          lift(BENCH, 4, 6, { to: 8 }),
          lift(OVERHEAD_PRESS, 3, 8, { to: 10 }),
          lift(INCLINE_DB_PRESS, 3, 8, { to: 12 }),
          lift(LATERAL_RAISE, 3, 12, { to: 15 }),
          lift(CLOSE_GRIP_BENCH, 3, 8, { to: 12 }),
        ],
      },
      {
        id: 'pull_a',
        exercises: [
          lift(ROW, 4, 6, { to: 8 }),
          lift(PULL_UPS, 3, 5, { to: 10 }),
          lift(ONE_ARM_ROW, 3, 8, { to: 12 }),
          lift(REVERSE_FLYES, 3, 12, { to: 15 }),
          lift(BARBELL_CURL, 3, 8, { to: 12 }),
        ],
      },
      {
        id: 'legs_a',
        exercises: [
          lift(SQUAT, 4, 6, { to: 8, lower: true }),
          lift(ROMANIAN_DEADLIFT, 3, 8, { to: 10, lower: true }),
          lift(LUNGE, 3, 10, { to: 14, lower: true }),
          lift(HIP_THRUST, 3, 8, { to: 12, lower: true }),
          lift(BARBELL_CALF_RAISE, 4, 10, { to: 15 }),
        ],
      },
    ],
  },
  {
    id: 'full_body_3_home',
    level: 'beginner',
    goal: 'muscle',
    venue: 'home',
    daysPerWeek: 3,
    sessions: [
      {
        id: 'full_body_a',
        exercises: [
          lift(DB_SQUAT, 3, 10, { to: 15, lower: true }),
          lift(DB_BENCH, 3, 8, { to: 12 }),
          lift(DB_ROW, 3, 8, { to: 12 }),
          lift(DB_SHOULDER_PRESS, 2, 8, { to: 12 }),
          hold(PLANK, 3, 30),
        ],
      },
      {
        id: 'full_body_b',
        exercises: [
          lift(DB_ROMANIAN_DEADLIFT, 3, 8, { to: 12, lower: true }),
          lift(PUSH_UPS, 3, 8, { to: 15 }),
          lift(PULL_UPS, 3, 4, { to: 8 }),
          lift(SPLIT_SQUAT, 2, 10, { to: 14, lower: true }),
          lift(DB_CURL, 2, 10, { to: 14 }),
        ],
      },
    ],
  },
  {
    id: 'upper_lower_4_home',
    level: 'beginner',
    goal: 'muscle',
    venue: 'home',
    daysPerWeek: 4,
    sessions: [
      {
        id: 'upper_a',
        exercises: [
          lift(DB_BENCH, 4, 8, { to: 12 }),
          lift(DB_ROW, 4, 8, { to: 12 }),
          lift(DB_SHOULDER_PRESS, 3, 8, { to: 12 }),
          lift(PULL_UPS, 3, 4, { to: 8 }),
          lift(DB_CURL, 2, 10, { to: 14, superset: 1 }),
          lift(DB_TRICEPS_EXTENSION, 2, 10, { to: 14, superset: 1 }),
        ],
      },
      {
        id: 'lower_a',
        exercises: [
          lift(DB_SQUAT, 4, 8, { to: 12, lower: true }),
          lift(DB_ROMANIAN_DEADLIFT, 3, 8, { to: 12, lower: true }),
          lift(SPLIT_SQUAT, 3, 8, { to: 12, lower: true }),
          lift(SINGLE_LEG_BRIDGE, 3, 10, { to: 15 }),
          lift(DB_CALF_RAISE, 4, 12, { to: 20 }),
        ],
      },
      {
        id: 'upper_b',
        exercises: [
          lift(INCLINE_DB_PRESS, 4, 8, { to: 12 }),
          lift(ONE_ARM_ROW, 4, 8, { to: 12 }),
          lift(LATERAL_RAISE, 3, 12, { to: 15 }),
          lift(CHIN_UP, 3, 4, { to: 8 }),
          lift(REVERSE_FLYES, 3, 12, { to: 15 }),
          lift(HAMMER_CURL, 2, 10, { to: 14, superset: 1 }),
          lift(DB_KICKBACK, 2, 10, { to: 14, superset: 1 }),
        ],
      },
      {
        id: 'lower_b',
        exercises: [
          lift(STEP_UP, 3, 8, { to: 12, lower: true }),
          lift(DB_ROMANIAN_DEADLIFT, 3, 8, { to: 12, lower: true }),
          lift(DB_SQUAT, 3, 10, { to: 15, lower: true }),
          lift(SINGLE_LEG_BRIDGE, 3, 10, { to: 15 }),
          lift(DB_CALF_RAISE, 4, 12, { to: 20 }),
          hold(PLANK, 3, 30),
        ],
      },
    ],
  },
  {
    id: 'push_pull_legs_3_home',
    level: 'beginner',
    goal: 'muscle',
    venue: 'home',
    daysPerWeek: 3,
    sessions: [
      {
        id: 'push_a',
        exercises: [
          lift(DB_BENCH, 4, 8, { to: 12 }),
          lift(DB_SHOULDER_PRESS, 3, 8, { to: 12 }),
          lift(INCLINE_DB_PRESS, 3, 8, { to: 12 }),
          lift(LATERAL_RAISE, 3, 12, { to: 15 }),
          lift(DB_TRICEPS_EXTENSION, 3, 10, { to: 14 }),
        ],
      },
      {
        id: 'pull_a',
        exercises: [
          lift(DB_ROW, 4, 8, { to: 12 }),
          lift(PULL_UPS, 3, 4, { to: 8 }),
          lift(ONE_ARM_ROW, 3, 8, { to: 12 }),
          lift(REVERSE_FLYES, 3, 12, { to: 15 }),
          lift(HAMMER_CURL, 3, 10, { to: 14 }),
        ],
      },
      {
        id: 'legs_a',
        exercises: [
          lift(DB_SQUAT, 4, 8, { to: 12, lower: true }),
          lift(DB_ROMANIAN_DEADLIFT, 3, 8, { to: 12, lower: true }),
          lift(SPLIT_SQUAT, 3, 8, { to: 12, lower: true }),
          lift(SINGLE_LEG_BRIDGE, 3, 10, { to: 15 }),
          lift(DB_CALF_RAISE, 4, 12, { to: 20 }),
        ],
      },
    ],
  },
];

export function getWorkoutSplit(id: string): WorkoutSplit | undefined {
  return WORKOUT_SPLITS.find((split) => split.id === id);
}

/** Every free-exercise-db id a split uses, each once, in the order met. */
export function workoutSplitExerciseIds(split: WorkoutSplit): string[] {
  const ids = new Set<string>();
  for (const session of split.sessions) {
    for (const exercise of session.exercises) ids.add(exercise.exerciseId);
  }
  return [...ids];
}
