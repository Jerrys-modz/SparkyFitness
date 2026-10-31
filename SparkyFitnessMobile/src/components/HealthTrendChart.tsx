import React from 'react';
import type { HealthTrendKey } from '../constants/healthTrends';
import type {
  CaloriesTrendSeries,
  HeartRateTrendSeries,
  SleepTrendSeries,
} from '../hooks/useHealthTrends';
import type {
  StepsDataPoint,
  WeightDataPoint,
} from '../hooks/useMeasurementsRange';
import type {
  HealthTrendDateRange,
  HealthTrendSeries,
  HydrationDataPoint,
  Vo2MaxDataPoint,
} from '../types/healthTrends';
import CaloriesBarChart from './CaloriesBarChart';
import HeartRateLineChart from './HeartRateLineChart';
import HydrationBarChart from './HydrationBarChart';
import SleepTimelineChart from './SleepTimelineChart';
import StepsBarChart from './StepsBarChart';
import Vo2MaxLineChart from './Vo2MaxLineChart';
import WeightLineChart from './WeightLineChart';

/** Everything the Dashboard's trend views draw from, shared by the pager and the tiles. */
export type HealthTrendsData = {
  steps: HealthTrendSeries<StepsDataPoint> & {
    stepsGoals?: (number | null)[];
  };
  weight: HealthTrendSeries<WeightDataPoint>;
  sleep: SleepTrendSeries;
  hydration: HealthTrendSeries<HydrationDataPoint>;
  calories: CaloriesTrendSeries;
  heartRate?: HeartRateTrendSeries;
  /** Optional so a caller that predates the trend still renders; absent reads as no data. */
  vo2max?: HealthTrendSeries<Vo2MaxDataPoint>;
  /** The window every graph plots, unless `ranges` gives one its own. */
  range: HealthTrendDateRange;
  /** A graph's own window, overriding `range`. */
  ranges?: Partial<Record<HealthTrendKey, HealthTrendDateRange>>;
  weightUnit: string;
  waterUnit: string;
  /** The live target weight. `target_weight` has no per-day history anywhere in the
   * schema (a single scalar profile field), so this stays a flat line across the whole
   * window by necessity -- there is nothing to step between. */
  weightGoal?: number | null;
  /** The resolved hydration goal for each day in the window, same order as
   * `hydration.data`, stepping to a new value on the day it actually changed. */
  hydrationGoals?: (number | null)[];
  /** The resolved calorie goal for each day in the window, same order as
   * `calories.data`, stepping to a new value on the day it actually changed. */
  calorieGoals?: (number | null)[];
};

export const NO_VO2MAX: HealthTrendSeries<Vo2MaxDataPoint> = {
  data: [],
  isLoading: false,
  isError: false,
};

export const NO_HEART_RATE: HeartRateTrendSeries = {
  data: [],
  isLoading: false,
  isError: false,
  averageRestingHr: null,
  minRestingHr: null,
  maxRestingHr: null,
};

export const rangeForTrend = (
  data: Pick<HealthTrendsData, 'range' | 'ranges'>,
  key: HealthTrendKey
): HealthTrendDateRange => data.ranges?.[key] ?? data.range;

const shouldShowTrend = <TPoint,>(series: HealthTrendSeries<TPoint>): boolean =>
  series.isLoading || series.isError || series.data.length > 0;

export const trendHasData = (
  key: HealthTrendKey,
  data: HealthTrendsData
): boolean => {
  const { steps, weight, sleep, hydration, calories } = data;
  const heartRate = data.heartRate ?? NO_HEART_RATE;
  const vo2max = data.vo2max ?? NO_VO2MAX;
  switch (key) {
    case 'steps':
      return shouldShowTrend(steps);
    case 'weight':
      return shouldShowTrend(weight);
    // Sleep cannot use `shouldShowTrend`: its `data` is padded to one entry per day in the
    // window, so it is never empty and the page would show for users with no sleep at all.
    case 'sleep':
      return sleep.isLoading || sleep.isError || sleep.nightsWithData > 0;
    // Hydration cannot use `shouldShowTrend` either: `useHydrationRange` zero-fills every
    // day in the window, so `data` is never empty and the page would show for users who
    // have never logged water. A day of zero is real data; a window of them is not.
    case 'hydration':
      return (
        hydration.isLoading ||
        hydration.isError ||
        hydration.data.some((point) => point.milliliters > 0)
      );
    // Same reasoning as hydration: `useCaloriesRange` zero-fills every day too.
    case 'calories':
      return (
        calories.isLoading ||
        calories.isError ||
        calories.data.some((point) => point.calories > 0)
      );
    // Wearable-synced metrics wait for readings so users without them see no empty error card
    case 'heartRate':
      return heartRate.isLoading || heartRate.data.length > 0;
    case 'vo2max':
      return vo2max.data.length > 0;
  }
};

type HealthTrendChartProps = HealthTrendsData & { trendKey: HealthTrendKey };

const HealthTrendChart: React.FC<HealthTrendChartProps> = ({
  trendKey,
  steps,
  weight,
  sleep,
  hydration,
  calories,
  heartRate = NO_HEART_RATE,
  vo2max = NO_VO2MAX,
  range,
  ranges,
  weightUnit,
  waterUnit,
  weightGoal,
  hydrationGoals,
  calorieGoals,
}) => {
  const trendRange = rangeForTrend({ range, ranges }, trendKey);
  switch (trendKey) {
    case 'steps':
      return <StepsBarChart {...steps} range={trendRange} />;
    case 'weight':
      return (
        <WeightLineChart
          {...weight}
          range={trendRange}
          unit={weightUnit}
          goal={weightGoal}
        />
      );
    case 'sleep':
      return <SleepTimelineChart {...sleep} range={trendRange} />;
    case 'hydration':
      return (
        <HydrationBarChart
          {...hydration}
          range={trendRange}
          unit={waterUnit}
          goals={hydrationGoals}
        />
      );
    case 'calories':
      return (
        <CaloriesBarChart
          {...calories}
          range={trendRange}
          goals={calorieGoals}
        />
      );
    case 'heartRate':
      return <HeartRateLineChart {...heartRate} range={trendRange} />;
    case 'vo2max':
      return <Vo2MaxLineChart {...vo2max} range={trendRange} />;
  }
};

export default HealthTrendChart;
