import type { TFunction } from 'i18next';

import { formatLocalizedNumber } from '../localization';
import {
  formatDuration,
  formatVolume,
  getExerciseVolumeKg,
  getSessionCalories,
  summarizeWorkoutHeartRate,
  type WorkoutCompletionSummary,
  type WorkoutHeartRateSummary,
} from './workoutSession';
import type { PresetSessionResponse } from '@workspace/shared';

export interface WorkoutShareStat {
  label: string;
  value: string;
}

/** Everything the share image draws, already localized and formatted. */
export interface WorkoutShareData {
  title: string;
  dateText: string;
  stats: WorkoutShareStat[];
  records: string[];
  exercises: string[];
}

export const SHARE_CARD_MAX_STATS = 6;
export const SHARE_CARD_MAX_RECORDS = 3;
export const SHARE_CARD_MAX_EXERCISES = 6;

function heartRateStats(
  heartRate: WorkoutHeartRateSummary | null,
  t: TFunction
): WorkoutShareStat[] {
  const stats: WorkoutShareStat[] = [];
  if (heartRate) {
    stats.push({
      label: t('workoutShare.avgHeartRate', { defaultValue: 'Avg HR' }),
      value: formatLocalizedNumber(Math.round(heartRate.avgBpm)),
    });
    if (heartRate.maxBpm != null) {
      stats.push({
        label: t('workoutShare.maxHeartRate', { defaultValue: 'Max HR' }),
        value: formatLocalizedNumber(Math.round(heartRate.maxBpm)),
      });
    }
  }
  return stats;
}

function caloriesStat(calories: number | null, t: TFunction) {
  return calories != null && calories > 0
    ? [
        {
          label: t('workoutShare.calories', { defaultValue: 'Calories' }),
          value: formatLocalizedNumber(Math.round(calories)),
        },
      ]
    : [];
}

function capped<T>(items: T[], max: number): T[] {
  return items.slice(0, max);
}

/** The share card for the Workout Complete screen. */
export function buildCompleteShareData(args: {
  title: string;
  dateText: string;
  durationMinutes: number;
  summary: WorkoutCompletionSummary;
  caloriesValue: number | null;
  heartRate: WorkoutHeartRateSummary | null;
  weightUnit: 'kg' | 'lbs';
  t: TFunction;
}): WorkoutShareData {
  const { summary, weightUnit, t } = args;
  const stats: WorkoutShareStat[] = [];
  if (args.durationMinutes > 0) {
    stats.push({
      label: t('workoutShare.duration', { defaultValue: 'Time' }),
      value: formatDuration(args.durationMinutes),
    });
  }
  if (summary.volumeKg > 0) {
    stats.push({
      label: t('workoutShare.volume', { defaultValue: 'Volume' }),
      value: formatVolume(summary.volumeKg, weightUnit),
    });
  }
  stats.push({
    label: t('workoutShare.sets', { defaultValue: 'Sets' }),
    value: String(summary.completedSetCount),
  });
  stats.push(...caloriesStat(args.caloriesValue, t));
  stats.push(...heartRateStats(args.heartRate, t));

  return {
    title: args.title,
    dateText: args.dateText,
    stats: capped(stats, SHARE_CARD_MAX_STATS),
    records: capped(
      summary.prRows.map((row) => row.exerciseName),
      SHARE_CARD_MAX_RECORDS
    ),
    exercises: capped(
      summary.exercises
        .filter((e) => e.completedSetCount > 0)
        .map((e) => e.name),
      SHARE_CARD_MAX_EXERCISES
    ),
  };
}

/** The share card for a saved workout on the Workout Detail screen. */
export function buildSavedShareData(args: {
  session: PresetSessionResponse;
  dateText: string;
  weightUnit: 'kg' | 'lbs';
  bodyWeightKg: number | null;
  t: TFunction;
}): WorkoutShareData {
  const { session, weightUnit, t } = args;
  const sets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const volumeKg = session.exercises.reduce(
    (sum, e) => sum + getExerciseVolumeKg(e, args.bodyWeightKg),
    0
  );
  const stats: WorkoutShareStat[] = [
    {
      label: t('workoutShare.exercises', { defaultValue: 'Exercises' }),
      value: String(session.exercises.length),
    },
  ];
  if (sets > 0) {
    stats.push({
      label: t('workoutShare.sets', { defaultValue: 'Sets' }),
      value: String(sets),
    });
  }
  if (volumeKg > 0) {
    stats.push({
      label: t('workoutShare.volume', { defaultValue: 'Volume' }),
      value: formatVolume(volumeKg, weightUnit),
    });
  }
  stats.push(...caloriesStat(getSessionCalories(session), t));
  stats.push(
    ...heartRateStats(summarizeWorkoutHeartRate(session.exercises), t)
  );

  return {
    title: session.name,
    dateText: args.dateText,
    stats: capped(stats, SHARE_CARD_MAX_STATS),
    records: [],
    exercises: capped(
      session.exercises
        .map((e) => e.exercise_snapshot?.name ?? '')
        .filter(Boolean),
      SHARE_CARD_MAX_EXERCISES
    ),
  };
}
