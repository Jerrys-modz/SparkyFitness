import type { ProgressionMode } from '../types/progression.ts';

/**
 * Ready-made strength splits for people starting out. Pure data: the app owns
 * the names and descriptions (translation keys are the split and session ids),
 * and importing a split into a person's presets and plan is done by the server.
 */

/** Every exercise in a split is a free-exercise-db id, never a name. */
export const WORKOUT_SPLIT_EXERCISE_SOURCE = 'free-exercise-db';

export type WorkoutSplitLevel = 'beginner' | 'intermediate';

export interface WorkoutSplitExercise {
  /** free-exercise-db id, saved as the library exercise's `source_id`. */
  exerciseId: string;
  sets: number;
  /** Reps per set; the bottom of the range when `repGoal` is set. */
  reps: number;
  /** Top of the rep range: reaching it on every set earns a heavier load. */
  repGoal?: number;
  progressionMode: ProgressionMode;
  /** How much heavier the next session is after a progression, in kg. */
  incrementKg: number;
  /** Exercises sharing a number are done back to back. */
  supersetGroup?: number;
}

export interface WorkoutSplitSession {
  /** Stable id, also the translation key suffix. */
  id: string;
  exercises: WorkoutSplitExercise[];
}

export interface WorkoutSplit {
  /** Stable id, also the translation key suffix. */
  id: string;
  level: WorkoutSplitLevel;
  daysPerWeek: number;
  /** Done in order, then round again, like a sequential workout plan. */
  sessions: WorkoutSplitSession[];
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
): WorkoutSplitExercise {
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
const GOBLET_SQUAT = 'Goblet_Squat';
const PULL_UPS = 'Pullups';
const CABLE_CROSSOVER = 'Cable_Crossover';
const DUMBBELL_FLYES = 'Dumbbell_Flyes';
const SKULL_CRUSHER = 'EZ-Bar_Skullcrusher';
const HIP_THRUST = 'Barbell_Hip_Thrust';
const LUNGE = 'Dumbbell_Lunges';
const PLANK = 'Plank';

const FULL_BODY_A: WorkoutSplitSession = {
  id: 'full_body_a',
  exercises: [
    lift(GOBLET_SQUAT, 3, 8, { to: 12, lower: true }),
    lift(DB_BENCH, 3, 8, { to: 12 }),
    lift(CABLE_ROW, 3, 8, { to: 12 }),
    lift(DB_SHOULDER_PRESS, 2, 8, { to: 12 }),
    lift(PLANK, 3, 30),
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
    daysPerWeek: 3,
    sessions: [FULL_BODY_A, FULL_BODY_B],
  },
  {
    // Five sets of five on the big barbell lifts, a little heavier each time.
    id: 'linear_5x5',
    level: 'beginner',
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
    daysPerWeek: 4,
    sessions: [UPPER_A, LOWER_A, UPPER_B, LOWER_B],
  },
  {
    // One pass through push, pull and legs, repeated across the week.
    id: 'push_pull_legs_3',
    level: 'beginner',
    daysPerWeek: 3,
    sessions: [PUSH_A, PULL_A, LEGS_A],
  },
  {
    id: 'push_pull_legs_6',
    level: 'intermediate',
    daysPerWeek: 6,
    sessions: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B],
  },
  {
    id: 'body_part_5',
    level: 'intermediate',
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
