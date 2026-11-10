import { useMemo } from 'react';
import { dailyHeartRateAverages, type WidgetMetric } from '@workspace/shared';

import { useWidgetLayoutStore } from '../stores/widgetLayoutStore';
import type { WidgetMetricExtras } from '../services/widgetMetricSnapshot';
import type { CheckInMeasurement } from '../types/measurements';
import type { WeightDisplayMode } from '../utils/unitConversions';
import { toWatchFast } from '../utils/watchFast';
import { sleepMinutesForWidget } from '../utils/widgetExtras';
import { useCurrentFast } from './useFasting';
import { useHeartRateRange } from './useHeartRateRange';
import { useHeartRateSamples } from './useHeartRateTimelines';
import { useLoggingStreak } from './useLoggingStreak';
import { useSleepDay } from './useSleepDay';

interface UseWidgetExtrasOptions {
  /** The day's check-in, already loaded by the caller. */
  measurements: CheckInMeasurement | undefined;
  /** The day the widget numbers are for; a check-in from another day is ignored. */
  date: string | undefined;
  enabled: boolean;
  /** The account's weight unit, so the widget shows weight the way the app does. */
  weightUnit?: WeightDisplayMode;
  /** The account's water unit, so the widget shows water the way the app does. */
  waterUnit?: string;
}

const positive = (n: number | null | undefined): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;

/**
 * The widget figures the daily summary does not carry, for `useWidgetSync`.
 * Steps and weight come from the check-in the caller already has, so they
 * cost nothing. Everything else is fetched only while a saved widget actually
 * shows it (the fasting timer, sleep, either heart rate, the logging streak),
 * so a person without such a widget makes no extra request.
 *
 * A figure that is missing is left undefined, never zero, and the widget
 * draws a dash for it.
 */
export function useWidgetExtras({
  measurements,
  date,
  enabled,
  weightUnit,
  waterUnit,
}: UseWidgetExtrasOptions): WidgetMetricExtras {
  const layouts = useWidgetLayoutStore((state) => state.layouts);
  const used = useMemo(
    () =>
      new Set<WidgetMetric>(
        layouts.flatMap((layout) => layout.metrics.map((m) => m.metric))
      ),
    [layouts]
  );
  const on = (metric: WidgetMetric) => enabled && !!date && used.has(metric);

  const needsFast = used.has('fasting_elapsed');
  const { data: currentFast } = useCurrentFast({
    enabled: enabled && needsFast,
  });

  const { wakeUp } = useSleepDay(date ?? '', { enabled: on('sleep_duration') });
  const { heartRateData } = useHeartRateRange({
    range: '7d',
    enabled: on('resting_heart_rate'),
  });
  const { data: heartRateRows } = useHeartRateSamples(
    date ?? '',
    date ?? '',
    on('heart_rate')
  );
  const loggingStreakDays = useLoggingStreak(date, on('logging_streak'));

  const checkIn =
    measurements && measurements.entry_date === date ? measurements : undefined;
  const steps = positive(checkIn?.steps);
  const weightKg = positive(checkIn?.weight);
  const fastStartedAt = needsFast
    ? toWatchFast(currentFast)?.startedAt
    : undefined;
  const sleepMinutes = on('sleep_duration')
    ? (sleepMinutesForWidget(wakeUp) ?? undefined)
    : undefined;
  // The newest reading in the window: a resting rate is not logged every day.
  const restingHeartRate = on('resting_heart_rate')
    ? positive(
        [...heartRateData].reverse().find((point) => point.restingHr > 0)
          ?.restingHr
      )
    : undefined;
  const heartRate = on('heart_rate')
    ? positive(
        dailyHeartRateAverages(heartRateRows).find((d) => d.day === date)
          ?.avgBpm
      )
    : undefined;

  const streakDays = on('logging_streak') ? loggingStreakDays : undefined;

  return useMemo(
    () => ({
      steps,
      weightKg,
      weightUnit,
      waterUnit,
      fastStartedAt,
      sleepMinutes,
      restingHeartRate,
      heartRate,
      loggingStreakDays: streakDays,
    }),
    [
      steps,
      weightKg,
      weightUnit,
      waterUnit,
      fastStartedAt,
      sleepMinutes,
      restingHeartRate,
      heartRate,
      streakDays,
    ]
  );
}
