import type { TFunction } from 'i18next';
import type {
  WorkoutSplitExercise,
  WorkoutSplitGoal,
  WorkoutSplitLevel,
  WorkoutSplitVenue,
} from '@workspace/shared';

/** A built-in split's name; an unknown id reads as itself. */
export function splitName(t: TFunction, id: string): string {
  switch (id) {
    case 'full_body_3':
      return t('workoutSplits.splits.full_body_3.name', {
        defaultValue: 'Full body, 3 days',
      });
    case 'linear_5x5':
      return t('workoutSplits.splits.linear_5x5.name', {
        defaultValue: 'Linear 5x5',
      });
    case 'upper_lower_4':
      return t('workoutSplits.splits.upper_lower_4.name', {
        defaultValue: 'Upper / lower, 4 days',
      });
    case 'push_pull_legs_3':
      return t('workoutSplits.splits.push_pull_legs_3.name', {
        defaultValue: 'Push / pull / legs, 3 days',
      });
    case 'push_pull_legs_6':
      return t('workoutSplits.splits.push_pull_legs_6.name', {
        defaultValue: 'Push / pull / legs, 6 days',
      });
    case 'body_part_5':
      return t('workoutSplits.splits.body_part_5.name', {
        defaultValue: 'Body part split, 5 days',
      });
    case 'full_body_3_garage':
      return t('workoutSplits.splits.full_body_3_garage.name', {
        defaultValue: 'Full body, 3 days',
      });
    case 'upper_lower_4_garage':
      return t('workoutSplits.splits.upper_lower_4_garage.name', {
        defaultValue: 'Upper / lower, 4 days',
      });
    case 'push_pull_legs_3_garage':
      return t('workoutSplits.splits.push_pull_legs_3_garage.name', {
        defaultValue: 'Push / pull / legs, 3 days',
      });
    case 'full_body_3_home':
      return t('workoutSplits.splits.full_body_3_home.name', {
        defaultValue: 'Full body, 3 days',
      });
    case 'upper_lower_4_home':
      return t('workoutSplits.splits.upper_lower_4_home.name', {
        defaultValue: 'Upper / lower, 4 days',
      });
    case 'push_pull_legs_3_home':
      return t('workoutSplits.splits.push_pull_legs_3_home.name', {
        defaultValue: 'Push / pull / legs, 3 days',
      });
    default:
      return id;
  }
}

/** A sentence on who a split is for and what it needs. */
export function splitDescription(t: TFunction, id: string): string {
  switch (id) {
    case 'full_body_3':
      return t('workoutSplits.splits.full_body_3.description', {
        defaultValue:
          'Three full-body days a week, alternating two sessions. Gentle volume with dumbbells, cables and a few barbell lifts, a good way to learn the movements.',
      });
    case 'linear_5x5':
      return t('workoutSplits.splits.linear_5x5.description', {
        defaultValue:
          'Two sessions that alternate across three days a week: squat, bench or overhead press, and row or deadlift for five sets of five, adding weight every session. Needs a barbell, rack and bench.',
      });
    case 'upper_lower_4':
      return t('workoutSplits.splits.upper_lower_4.description', {
        defaultValue:
          'Upper body, lower body, then both again with different lifts, four days a week. Uses barbells, dumbbells, machines and cables.',
      });
    case 'push_pull_legs_3':
      return t('workoutSplits.splits.push_pull_legs_3.description', {
        defaultValue:
          'Push, pull and legs once each, three days a week. Uses barbells, dumbbells, machines and cables.',
      });
    case 'push_pull_legs_6':
      return t('workoutSplits.splits.push_pull_legs_6.description', {
        defaultValue:
          'Push, pull and legs twice a week with a different variation each time, six days a week. For lifters with some training behind them.',
      });
    case 'body_part_5':
      return t('workoutSplits.splits.body_part_5.description', {
        defaultValue:
          'One day each for chest, back, shoulders, arms and legs, five days a week, with more sets for each muscle in its day.',
      });
    case 'full_body_3_garage':
      return t('workoutSplits.splits.full_body_3_garage.description', {
        defaultValue:
          'Three full-body days a week, alternating two barbell sessions. Needs a barbell, squat rack, bench, dumbbells and a pull-up bar.',
      });
    case 'upper_lower_4_garage':
      return t('workoutSplits.splits.upper_lower_4_garage.description', {
        defaultValue:
          'Upper body and lower body, four days a week, built on the barbell lifts. Needs a barbell, squat rack, bench, dumbbells and a pull-up bar.',
      });
    case 'push_pull_legs_3_garage':
      return t('workoutSplits.splits.push_pull_legs_3_garage.description', {
        defaultValue:
          'Push, pull and legs once each, three days a week. Needs a barbell, squat rack, bench, dumbbells and a pull-up bar.',
      });
    case 'full_body_3_home':
      return t('workoutSplits.splits.full_body_3_home.description', {
        defaultValue:
          'Three full-body days a week, alternating two sessions. Needs dumbbells, a bench and a pull-up bar.',
      });
    case 'upper_lower_4_home':
      return t('workoutSplits.splits.upper_lower_4_home.description', {
        defaultValue:
          'Upper body and lower body, four days a week. Needs dumbbells, a bench and a pull-up bar.',
      });
    case 'push_pull_legs_3_home':
      return t('workoutSplits.splits.push_pull_legs_3_home.description', {
        defaultValue:
          'Push, pull and legs once each, three days a week. Needs dumbbells, a bench and a pull-up bar.',
      });
    default:
      return '';
  }
}

/** A session's name, such as "Push A"; an unknown id reads as itself. */
export function sessionName(t: TFunction, id: string): string {
  switch (id) {
    case 'full_body_a':
      return t('workoutSplits.sessions.full_body_a', {
        defaultValue: 'Full body A',
      });
    case 'full_body_b':
      return t('workoutSplits.sessions.full_body_b', {
        defaultValue: 'Full body B',
      });
    case 'workout_a':
      return t('workoutSplits.sessions.workout_a', {
        defaultValue: 'Workout A',
      });
    case 'workout_b':
      return t('workoutSplits.sessions.workout_b', {
        defaultValue: 'Workout B',
      });
    case 'upper_a':
      return t('workoutSplits.sessions.upper_a', { defaultValue: 'Upper A' });
    case 'upper_b':
      return t('workoutSplits.sessions.upper_b', { defaultValue: 'Upper B' });
    case 'lower_a':
      return t('workoutSplits.sessions.lower_a', { defaultValue: 'Lower A' });
    case 'lower_b':
      return t('workoutSplits.sessions.lower_b', { defaultValue: 'Lower B' });
    case 'push_a':
      return t('workoutSplits.sessions.push_a', { defaultValue: 'Push A' });
    case 'push_b':
      return t('workoutSplits.sessions.push_b', { defaultValue: 'Push B' });
    case 'pull_a':
      return t('workoutSplits.sessions.pull_a', { defaultValue: 'Pull A' });
    case 'pull_b':
      return t('workoutSplits.sessions.pull_b', { defaultValue: 'Pull B' });
    case 'legs_a':
      return t('workoutSplits.sessions.legs_a', { defaultValue: 'Legs A' });
    case 'legs_b':
      return t('workoutSplits.sessions.legs_b', { defaultValue: 'Legs B' });
    case 'chest':
      return t('workoutSplits.sessions.chest', { defaultValue: 'Chest' });
    case 'back':
      return t('workoutSplits.sessions.back', { defaultValue: 'Back' });
    case 'shoulders':
      return t('workoutSplits.sessions.shoulders', {
        defaultValue: 'Shoulders',
      });
    case 'arms':
      return t('workoutSplits.sessions.arms', { defaultValue: 'Arms' });
    case 'legs':
      return t('workoutSplits.sessions.legs', { defaultValue: 'Legs' });
    default:
      return id;
  }
}

export const levelLabel = (t: TFunction, level: WorkoutSplitLevel): string =>
  level === 'beginner'
    ? t('workoutSplits.level.beginner', { defaultValue: 'Beginner' })
    : t('workoutSplits.level.intermediate', { defaultValue: 'Intermediate' });

export const goalLabel = (t: TFunction, goal: WorkoutSplitGoal): string =>
  goal === 'muscle'
    ? t('workoutSplits.goal.muscle', { defaultValue: 'Build muscle' })
    : t('workoutSplits.goal.strength', { defaultValue: 'Gain strength' });

export const venueLabel = (t: TFunction, venue: WorkoutSplitVenue): string => {
  switch (venue) {
    case 'home':
      return t('workoutSplits.venue.home', { defaultValue: 'At home' });
    case 'garage':
      return t('workoutSplits.venue.garage', { defaultValue: 'Garage gym' });
    case 'gym':
      return t('workoutSplits.venue.gym', { defaultValue: 'Gym' });
  }
};

/** A free-exercise-db id as a readable name ("Barbell_Squat" is "Barbell Squat"); the library has the real name once the split is imported. */
export const exerciseLabel = (exerciseId: string): string =>
  exerciseId.replace(/_/g, ' ');

/** "3 x 8-12" for a rep range, "5 x 5" for fixed reps, "3 x 30 s" for a hold. */
export const exerciseTarget = (
  t: TFunction,
  exercise: WorkoutSplitExercise
): string => {
  if (exercise.durationSeconds !== undefined) {
    return t('workoutSplits.target.hold', {
      sets: exercise.sets,
      seconds: exercise.durationSeconds,
      defaultValue: '{{sets}} x {{seconds}} s',
    });
  }
  const reps =
    exercise.repGoal !== undefined
      ? `${exercise.reps}-${exercise.repGoal}`
      : String(exercise.reps);
  return t('workoutSplits.target.reps', {
    sets: exercise.sets,
    reps,
    defaultValue: '{{sets}} x {{reps}}',
  });
};
