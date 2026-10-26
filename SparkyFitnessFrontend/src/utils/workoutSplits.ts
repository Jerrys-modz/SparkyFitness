import type { TFunction } from 'i18next';
import type {
  TrainerFocus,
  WorkoutSplitExercise,
  WorkoutSplitGoal,
  WorkoutSplitLevel,
  WorkoutSplitVenue,
} from '@workspace/shared';
import {
  WORKOUT_SPLIT_COPY,
  WORKOUT_SPLIT_SESSION_NAMES,
} from '@/constants/workoutSplitCopy';

/** A built-in split's name; an unknown id reads as itself. */
export const splitName = (t: TFunction, id: string): string =>
  t(`workoutSplits.splits.${id}.name`, WORKOUT_SPLIT_COPY[id]?.name ?? id);

export const splitDescription = (t: TFunction, id: string): string =>
  t(
    `workoutSplits.splits.${id}.description`,
    WORKOUT_SPLIT_COPY[id]?.description ?? ''
  );

/** A session's name, such as "Push A". */
export const sessionName = (t: TFunction, id: string): string =>
  t(`workoutSplits.sessions.${id}`, WORKOUT_SPLIT_SESSION_NAMES[id] ?? id);

export const levelLabel = (t: TFunction, level: WorkoutSplitLevel): string =>
  level === 'beginner'
    ? t('workoutSplits.level.beginner', 'Beginner')
    : t('workoutSplits.level.intermediate', 'Intermediate');

export const goalLabel = (t: TFunction, goal: WorkoutSplitGoal): string =>
  goal === 'muscle'
    ? t('workoutSplits.goal.muscle', 'Build muscle')
    : t('workoutSplits.goal.strength', 'Gain strength');

export const venueLabel = (t: TFunction, venue: WorkoutSplitVenue): string => {
  switch (venue) {
    case 'home':
      return t('workoutSplits.venue.home', 'At home');
    case 'garage':
      return t('workoutSplits.venue.garage', 'Garage gym');
    case 'gym':
      return t('workoutSplits.venue.gym', 'Gym');
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
    return t('workoutSplits.target.hold', '{{sets}} x {{seconds}} s', {
      sets: exercise.sets,
      seconds: exercise.durationSeconds,
    });
  }
  const reps =
    exercise.repGoal !== undefined
      ? `${exercise.reps}-${exercise.repGoal}`
      : String(exercise.reps);
  return t('workoutSplits.target.reps', '{{sets}} x {{reps}}', {
    sets: exercise.sets,
    reps,
  });
};

export const focusLabel = (t: TFunction, focus: TrainerFocus): string => {
  switch (focus) {
    case 'core':
      return t('workoutSplits.focus.core', 'Core');
    case 'chest':
      return t('workoutSplits.focus.chest', 'Chest');
    case 'arms':
      return t('workoutSplits.focus.arms', 'Arms');
    case 'shoulders':
      return t('workoutSplits.focus.shoulders', 'Shoulders');
    case 'legs':
      return t('workoutSplits.focus.legs', 'Legs');
  }
};
