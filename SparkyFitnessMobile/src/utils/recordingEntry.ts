import type { DiaryActivity, RecordingActivity } from './gpsRecording';

/** Library names the three activities are logged under. */
export const EXERCISE_NAMES: Record<DiaryActivity, string> = {
  walk: 'Walking',
  run: 'Running',
  ride: 'Cycling',
  jumpRope: 'Jump Rope',
};

/**
 * Names an indoor entry is logged under. They avoid "Treadmill Walk": sport
 * detection reads "treadmill" as running, so a walk would match two sports and
 * fall back to "other". "Indoor" is a modifier, not a sport.
 */
export const INDOOR_ENTRY_NAMES: Record<RecordingActivity, string> = {
  walk: 'Indoor Walking',
  run: 'Indoor Running',
  ride: 'Indoor Cycling',
};

// Rough figures for an average adult. Used when the library has no exercise of
// that name to take calories per hour from, and to show a run saved on the
// phone before the server has estimated it.
export const FALLBACK_CALORIES_PER_HOUR: Record<DiaryActivity, number> = {
  walk: 250,
  run: 600,
  ride: 450,
  jumpRope: 700,
};

/** A rough calorie figure for `minutes` of an activity. */
export function estimateRecordingCalories(
  activity: DiaryActivity,
  minutes: number
): number {
  return Math.round((FALLBACK_CALORIES_PER_HOUR[activity] / 60) * minutes);
}
