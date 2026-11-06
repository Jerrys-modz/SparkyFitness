/** English copy for the built-in workout splits; also the i18n defaults. Keys under `workoutSplits.splits.<id>` and `workoutSplits.sessions.<id>` in the locale file mirror it. */
export interface WorkoutSplitCopy {
  name: string;
  description: string;
}

export const WORKOUT_SPLIT_COPY: Readonly<Record<string, WorkoutSplitCopy>> = {
  full_body_3: {
    name: 'Full body, 3 days',
    description:
      'Three full-body days a week, alternating two sessions. Gentle volume with dumbbells, cables and a few barbell lifts, a good way to learn the movements.',
  },
  linear_5x5: {
    name: 'Linear 5x5',
    description:
      'Two sessions that alternate across three days a week: squat, bench or overhead press, and row or deadlift for five sets of five, adding weight every session. Needs a barbell, rack and bench.',
  },
  upper_lower_4: {
    name: 'Upper / lower, 4 days',
    description:
      'Upper body, lower body, then both again with different lifts, four days a week. Uses barbells, dumbbells, machines and cables.',
  },
  push_pull_legs_3: {
    name: 'Push / pull / legs, 3 days',
    description:
      'Push, pull and legs once each, three days a week. Uses barbells, dumbbells, machines and cables.',
  },
  push_pull_legs_6: {
    name: 'Push / pull / legs, 6 days',
    description:
      'Push, pull and legs twice a week with a different variation each time, six days a week. For lifters with some training behind them.',
  },
  body_part_5: {
    name: 'Body part split, 5 days',
    description:
      'One day each for chest, back, shoulders, arms and legs, five days a week, with more sets for each muscle in its day.',
  },
  full_body_3_garage: {
    name: 'Full body, 3 days',
    description:
      'Three full-body days a week, alternating two barbell sessions. Needs a barbell, squat rack, bench, dumbbells and a pull-up bar.',
  },
  upper_lower_4_garage: {
    name: 'Upper / lower, 4 days',
    description:
      'Upper body and lower body, four days a week, built on the barbell lifts. Needs a barbell, squat rack, bench, dumbbells and a pull-up bar.',
  },
  push_pull_legs_3_garage: {
    name: 'Push / pull / legs, 3 days',
    description:
      'Push, pull and legs once each, three days a week. Needs a barbell, squat rack, bench, dumbbells and a pull-up bar.',
  },
  full_body_3_home: {
    name: 'Full body, 3 days',
    description:
      'Three full-body days a week, alternating two sessions. Needs dumbbells, a bench and a pull-up bar.',
  },
  upper_lower_4_home: {
    name: 'Upper / lower, 4 days',
    description:
      'Upper body and lower body, four days a week. Needs dumbbells, a bench and a pull-up bar.',
  },
  push_pull_legs_3_home: {
    name: 'Push / pull / legs, 3 days',
    description:
      'Push, pull and legs once each, three days a week. Needs dumbbells, a bench and a pull-up bar.',
  },
};

/** English names of the sessions, by session id (shared between splits). */
export const WORKOUT_SPLIT_SESSION_NAMES: Readonly<Record<string, string>> = {
  full_body_a: 'Full body A',
  full_body_b: 'Full body B',
  workout_a: 'Workout A',
  workout_b: 'Workout B',
  upper_a: 'Upper A',
  upper_b: 'Upper B',
  lower_a: 'Lower A',
  lower_b: 'Lower B',
  push_a: 'Push A',
  push_b: 'Push B',
  pull_a: 'Pull A',
  pull_b: 'Pull B',
  legs_a: 'Legs A',
  legs_b: 'Legs B',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
};
