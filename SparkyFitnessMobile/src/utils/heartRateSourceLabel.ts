import type { TFunction } from 'i18next';
import type { HeartRateSource } from '@workspace/shared';

/**
 * What measured a workout's heart rate, in words ("Apple Watch",
 * "Headphones"), or null when the app does not know (synced and older entries).
 */
export function heartRateSourceLabel(
  t: TFunction,
  source: HeartRateSource | null | undefined
): string | null {
  if (source === 'watch') {
    return t('activeWorkout.exercise.heartRateSource.watch', {
      defaultValue: 'Apple Watch',
    });
  }
  if (source === 'headphones') {
    return t('activeWorkout.exercise.heartRateSource.headphones', {
      defaultValue: 'Headphones',
    });
  }
  return null;
}

/**
 * The sources of a workout's heart rate in words, joined when it used more
 * than one ("Apple Watch + Headphones"), or null when none is known.
 */
export function heartRateSourcesLabel(
  t: TFunction,
  sources: readonly HeartRateSource[]
): string | null {
  const labels = sources
    .map((source) => heartRateSourceLabel(t, source))
    .filter((label): label is string => label != null);
  return labels.length > 0 ? labels.join(' + ') : null;
}
