import { daysBetween } from './timezone.ts';
import {
  isRunningActivity,
  type RunningTrendsActivity,
} from './runningTrends.ts';
import { heartRateZoneFor } from './heartRateZones.ts';

/**
 * Monthly average running pace for each heart-rate zone, from logged runs.
 * Pure, so web and mobile read the same figures. A run is placed in the zone
 * its average heart rate falls in, so this is a trend of "how fast you run at
 * the same effort", not a measurement of time spent in a zone.
 */

/** The fields of an activity this needs (a subset of the stats query item). */
export interface PaceByZoneActivity extends RunningTrendsActivity {
  movingDurationMinutes?: number | null;
}

export interface PaceByZoneMonth {
  /** YYYY-MM. */
  month: string;
  /** Distance-weighted average pace in seconds per km; null with no runs. */
  paceSecondsPerKm: number | null;
  runs: number;
  /** Seconds per km against the previous month that has runs; null for the first. Negative is faster. */
  changeSeconds: number | null;
}

export interface PaceByZoneTrend {
  /** Seconds per km, newest month against the oldest with runs; negative is faster. */
  changeSeconds: number;
  /** Calendar months between those two months. */
  months: number;
  direction: 'faster' | 'slower' | 'steady';
}

export interface PaceByZone {
  zone: number;
  /** Oldest first; always `months` entries, empty months included. */
  months: PaceByZoneMonth[];
  /** Null until two months have runs. */
  trend: PaceByZoneTrend | null;
}

/** Runs shorter than this say little about pace at a given effort. */
const MIN_RUN_METERS = 1000;
const MIN_RUN_MINUTES = 10;
/** A reading outside this heart-rate range is a sensor glitch, not a run. */
const MIN_PLAUSIBLE_HR = 60;
const MAX_PLAUSIBLE_HR = 220;
/** A change smaller than this many seconds per km is "steady". */
export const PACE_STEADY_SECONDS = 3;

/** The month of a YYYY-MM-DD day, `back` months earlier (YYYY-MM). */
export function monthKeyBefore(day: string, back: number): string {
  const [year, month] = day.split('-').map(Number);
  const index = year! * 12 + (month! - 1) - back;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

const monthIndex = (key: string): number => {
  const [year, month] = key.split('-').map(Number);
  return year! * 12 + (month! - 1);
};

/** First day (YYYY-MM-DD) of the oldest month in a `months`-long window ending with today's month. */
export function paceByZoneStartDay(today: string, months: number): string {
  return `${monthKeyBefore(today, months - 1)}-01`;
}

/**
 * Average pace per month for each of `zones` (1 to 5), over the `months`
 * calendar months ending with the one containing `today`. `floors` are the
 * five ascending zone floors from `resolveHeartRateZones`.
 */
export function buildPaceByZone(
  activities: readonly PaceByZoneActivity[],
  floors: readonly number[],
  options: { today: string; months?: number; zones?: readonly number[] }
): PaceByZone[] {
  const monthCount = options.months ?? 4;
  const zones = options.zones ?? [2, 3];
  const keys = Array.from({ length: monthCount }, (_, i) =>
    monthKeyBefore(options.today, monthCount - 1 - i)
  );
  const startDay = paceByZoneStartDay(options.today, monthCount);

  // Seconds and metres per zone per month, so the average is weighted by distance.
  const totals = new Map<
    string,
    { seconds: number; meters: number; runs: number }
  >();
  for (const activity of activities) {
    const meters = activity.distanceMeters;
    const hr = activity.avgHeartRate;
    if (meters == null || !(meters >= MIN_RUN_METERS)) continue;
    if (hr == null || hr < MIN_PLAUSIBLE_HR || hr > MAX_PLAUSIBLE_HR) continue;
    const minutes = activity.movingDurationMinutes ?? activity.durationMinutes;
    if (!(minutes >= MIN_RUN_MINUTES)) continue;
    if (!isRunningActivity(activity)) continue;
    const day = activity.entryDate.slice(0, 10);
    if (daysBetween(startDay, day) < 0 || day > `${options.today}`) continue;

    const zone = heartRateZoneFor(hr, floors);
    if (!zones.includes(zone)) continue;
    const key = `${zone}:${day.slice(0, 7)}`;
    const bucket = totals.get(key) ?? { seconds: 0, meters: 0, runs: 0 };
    bucket.seconds += minutes * 60;
    bucket.meters += meters;
    bucket.runs += 1;
    totals.set(key, bucket);
  }

  return zones.map((zone) => {
    let previous: number | null = null;
    const months: PaceByZoneMonth[] = keys.map((month) => {
      const bucket = totals.get(`${zone}:${month}`);
      const pace = bucket ? bucket.seconds / (bucket.meters / 1000) : null;
      const changeSeconds =
        pace != null && previous != null ? pace - previous : null;
      if (pace != null) previous = pace;
      return {
        month,
        paceSecondsPerKm: pace,
        runs: bucket?.runs ?? 0,
        changeSeconds,
      };
    });

    const withRuns = months.filter((m) => m.paceSecondsPerKm != null);
    let trend: PaceByZoneTrend | null = null;
    if (withRuns.length >= 2) {
      const first = withRuns[0]!;
      const last = withRuns[withRuns.length - 1]!;
      const change = last.paceSecondsPerKm! - first.paceSecondsPerKm!;
      trend = {
        changeSeconds: change,
        months: monthIndex(last.month) - monthIndex(first.month),
        direction:
          Math.abs(change) < PACE_STEADY_SECONDS
            ? 'steady'
            : change < 0
              ? 'faster'
              : 'slower',
      };
    }
    return { zone, months, trend };
  });
}
