import type { HealthTrendKey } from '../constants/healthTrends';
import type {
  CaloriesDataPoint,
  HeartRateDataPoint,
  HydrationDataPoint,
  Vo2MaxDataPoint,
} from '../types/healthTrends';
import type { SleepTimelineDay } from '../types/sleep';
import type {
  StepsDataPoint,
  WeightDataPoint,
} from '../hooks/useMeasurementsRange';

/** The points behind each graph, as the dashboard already holds them. */
export type HealthTrendTileInput = {
  steps: readonly StepsDataPoint[];
  weight: readonly WeightDataPoint[];
  sleep: readonly SleepTimelineDay[];
  hydration: readonly HydrationDataPoint[];
  calories: readonly CaloriesDataPoint[];
  heartRate: readonly HeartRateDataPoint[];
  vo2max: readonly Vo2MaxDataPoint[];
};

export type HealthTrendTileSummary = {
  /** The plotted values, oldest first; days with no reading are left out. */
  values: number[];
  /**
   * `average` for daily totals (steps, water, calories, sleep), where one day is noisy
   * and the window's average says more; `latest` for readings (weight, resting heart
   * rate, VO2 max), where the newest value is the answer.
   */
  kind: 'average' | 'latest';
  headline: number | null;
  /** Newest minus oldest reading. Only meaningful for `latest` kinds, else null. */
  delta: number | null;
};

const SECONDS_PER_HOUR = 3600;

const average = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const toLatest = (values: number[]): HealthTrendTileSummary => ({
  values,
  kind: 'latest',
  headline: values.length > 0 ? values[values.length - 1] : null,
  delta: values.length > 1 ? values[values.length - 1] - values[0] : null,
});

/**
 * Daily totals are zero-filled by their hooks, so a zero is "nothing logged" rather than
 * a reading; those days stay out of the average, matching how the full charts decide
 * whether a window has data at all.
 */
const toAverage = (values: number[]): HealthTrendTileSummary => ({
  values,
  kind: 'average',
  headline: average(values),
  delta: null,
});

export function summarizeHealthTrend(
  key: HealthTrendKey,
  input: HealthTrendTileInput
): HealthTrendTileSummary {
  switch (key) {
    case 'steps':
      return toAverage(
        input.steps.map((p) => p.steps).filter((value) => value > 0)
      );
    case 'weight':
      return toLatest(input.weight.map((p) => p.weight));
    case 'sleep':
      return toAverage(
        input.sleep
          .map((day) => day.timeAsleepSeconds)
          .filter(
            (seconds): seconds is number => seconds != null && seconds > 0
          )
          .map((seconds) => seconds / SECONDS_PER_HOUR)
      );
    case 'hydration':
      return toAverage(
        input.hydration.map((p) => p.milliliters).filter((value) => value > 0)
      );
    case 'calories':
      return toAverage(
        input.calories.map((p) => p.calories).filter((value) => value > 0)
      );
    case 'heartRate':
      return toLatest(input.heartRate.map((p) => p.restingHr));
    case 'vo2max':
      return toLatest(input.vo2max.map((p) => p.vo2max));
  }
}

/**
 * The tiles to draw: the user's chosen tiles that are still visible, in the order the
 * graphs themselves are ordered, so reordering graphs reorders tiles too.
 */
export function selectTileTrends(
  visibleTrends: readonly HealthTrendKey[],
  tileKeys: readonly HealthTrendKey[]
): HealthTrendKey[] {
  return visibleTrends.filter((key) => tileKeys.includes(key));
}
