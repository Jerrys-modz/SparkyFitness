import type { TFunction } from 'i18next';

import { getAppLocale } from '../localization';

/**
 * "7h 49m" for a duration in seconds, signed once for negatives: flooring a
 * negative total would split -7 min into "-1h -7m". Sleep debt and the sleep
 * need's debt part go negative when there is a sleep surplus.
 */
export const formatSleepSeconds = (
  seconds: number | null,
  t: TFunction
): string => {
  if (seconds === null) return '-';
  const totalMinutes = Math.round(Math.abs(seconds) / 60);
  const duration = t('sleepAnalytics.duration', {
    defaultValue: '{{hours}}h {{minutes}}m',
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  });
  return seconds < 0 && totalMinutes > 0
    ? t('sleepAnalytics.negativeDuration', {
        defaultValue: '-{{duration}}',
        duration,
      })
    : duration;
};

/** A clock time from minutes after midnight, in the app locale's style. */
export const formatSleepClock = (minutes: number | null): string => {
  if (minutes === null) return '-';
  const rounded = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return new Date(
    2000,
    0,
    1,
    Math.floor(rounded / 60),
    rounded % 60
  ).toLocaleTimeString(getAppLocale(), { hour: 'numeric', minute: '2-digit' });
};
