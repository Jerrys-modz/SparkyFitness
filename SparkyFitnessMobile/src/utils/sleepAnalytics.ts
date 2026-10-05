import type { SleepEntry } from '../types/sleep';
import { addDays } from './dateUtils';
import { average } from './mathUtils';
import { selectMainSleep } from './sleepSessions';

export const SLEEP_ANALYTICS_METRICS = [
  'sleepScore',
  'hrv',
  'restingHeartRate',
  'spo2',
  'respiration',
  'stress',
  'bodyBattery',
] as const;

export type SleepAnalyticsMetric = (typeof SLEEP_ANALYTICS_METRICS)[number];

export type SleepAnalyticsPoint = { day: string; value: number };

export interface SleepStageAverages {
  deepSeconds: number | null;
  lightSeconds: number | null;
  remSeconds: number | null;
  awakeSeconds: number | null;
}

export interface SleepAnalytics {
  /** One point per day; `value` is 0 for a night without that reading. */
  series: Record<SleepAnalyticsMetric, SleepAnalyticsPoint[]>;
  /** Mean over nights that reported the metric; null when none did. */
  averages: Record<SleepAnalyticsMetric, number | null>;
  stages: SleepStageAverages;
  nightsWithData: number;
}

const readMetric = (
  entry: SleepEntry,
  metric: SleepAnalyticsMetric
): number | null | undefined => {
  switch (metric) {
    case 'sleepScore':
      return entry.sleep_score;
    case 'hrv':
      return entry.avg_overnight_hrv;
    case 'restingHeartRate':
      return entry.resting_heart_rate;
    case 'spo2':
      return entry.average_spo2_value;
    case 'respiration':
      return entry.average_respiration_value;
    case 'stress':
      return entry.avg_sleep_stress;
    case 'bodyBattery':
      return entry.body_battery_change;
  }
};

const positive = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;

/**
 * Per-night analytics over a window, taking each day's main sleep (the same rule the Diary
 * and the Health Trends sleep chart use) so a nap never overwrites the night.
 */
export function buildSleepAnalytics(
  entries: SleepEntry[],
  startDate: string,
  days: number
): SleepAnalytics {
  const byDay = new Map<string, SleepEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.entry_date);
    if (list) list.push(entry);
    else byDay.set(entry.entry_date, [entry]);
  }

  const series = Object.fromEntries(
    SLEEP_ANALYTICS_METRICS.map((metric) => [
      metric,
      [] as SleepAnalyticsPoint[],
    ])
  ) as Record<SleepAnalyticsMetric, SleepAnalyticsPoint[]>;
  const reported = Object.fromEntries(
    SLEEP_ANALYTICS_METRICS.map((metric) => [metric, [] as number[]])
  ) as Record<SleepAnalyticsMetric, number[]>;
  const deep: number[] = [];
  const light: number[] = [];
  const rem: number[] = [];
  const awake: number[] = [];
  let nightsWithData = 0;

  for (let i = 0; i < days; i++) {
    const day = addDays(startDate, i);
    const night = selectMainSleep(byDay.get(day) ?? []);
    if (night) nightsWithData += 1;

    for (const metric of SLEEP_ANALYTICS_METRICS) {
      const value = night ? positive(readMetric(night, metric)) : null;
      if (value !== null) reported[metric].push(value);
      series[metric].push({ day, value: value ?? 0 });
    }

    if (night) {
      const pairs: [number | null, number[]][] = [
        [night.deep_sleep_seconds, deep],
        [night.light_sleep_seconds, light],
        [night.rem_sleep_seconds, rem],
        [night.awake_sleep_seconds, awake],
      ];
      for (const [seconds, bucket] of pairs) {
        if (seconds != null) bucket.push(seconds);
      }
    }
  }

  const averages = Object.fromEntries(
    SLEEP_ANALYTICS_METRICS.map((metric) => [metric, average(reported[metric])])
  ) as Record<SleepAnalyticsMetric, number | null>;

  return {
    series,
    averages,
    stages: {
      deepSeconds: average(deep),
      lightSeconds: average(light),
      remSeconds: average(rem),
      awakeSeconds: average(awake),
    },
    nightsWithData,
  };
}
