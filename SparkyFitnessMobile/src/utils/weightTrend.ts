export type WeightTrendInput = { day: string; weight: number };

/** Smoothing per day: each day's weigh-in moves the trend this fraction of the way. */
export const TREND_SMOOTHING = 0.1;
/** The rate is fitted over at most this many trailing days of the trend. */
const RATE_WINDOW_DAYS = 28;
/** Fewest weigh-ins, and the shortest span they cover, before a rate is shown. */
const MIN_RATE_POINTS = 3;
const MIN_RATE_SPAN_DAYS = 7;
/** A projection further out than this is noise, not a forecast. */
const MAX_FORECAST_DAYS = 730;
/** A weekly change under this share of body weight reads as holding steady. */
const FLAT_RATE_FRACTION_PER_WEEK = 0.0005;

const MS_PER_DAY = 86_400_000;

const dayNumber = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / MS_PER_DAY);
};

/**
 * Exponentially smoothed weight, one value per input point. Gaps between weigh-ins are
 * honoured: a longer gap lets the new reading count for more, as if each missing day had
 * been smoothed toward it. `points` must be ascending by day.
 */
export function computeTrendWeights(
  points: readonly WeightTrendInput[]
): number[] {
  const trend: number[] = [];
  points.forEach((point, index) => {
    if (index === 0) {
      trend.push(point.weight);
      return;
    }
    const gap = Math.max(
      1,
      dayNumber(point.day) - dayNumber(points[index - 1].day)
    );
    const alpha = 1 - Math.pow(1 - TREND_SMOOTHING, gap);
    trend.push(trend[index - 1] + alpha * (point.weight - trend[index - 1]));
  });
  return trend;
}

export type WeightForecastStatus =
  | 'insufficient-data'
  | 'no-goal'
  | 'steady'
  | 'toward-goal'
  | 'away-from-goal'
  | 'too-far';

export type WeightForecast = {
  trendWeight: number | null;
  /** Change in trend weight per week, negative when losing. */
  ratePerWeek: number | null;
  /** Days from the last weigh-in until the trend reaches the goal, when heading there. */
  daysToGoal: number | null;
  status: WeightForecastStatus;
};

/**
 * The current trend weight, its weekly rate of change, and how long until it reaches
 * `goal` at that rate. The rate is a least-squares slope over the trailing trend values.
 */
export function computeWeightForecast(
  points: readonly WeightTrendInput[],
  goal: number | null | undefined
): WeightForecast {
  if (points.length === 0) {
    return {
      trendWeight: null,
      ratePerWeek: null,
      daysToGoal: null,
      status: 'insufficient-data',
    };
  }

  const trend = computeTrendWeights(points);
  const trendWeight = trend[trend.length - 1];
  const lastDay = dayNumber(points[points.length - 1].day);

  const window = points
    .map((point, index) => ({ x: dayNumber(point.day), y: trend[index] }))
    .filter((p) => lastDay - p.x < RATE_WINDOW_DAYS);
  const span = window[window.length - 1].x - window[0].x;

  if (window.length < MIN_RATE_POINTS || span < MIN_RATE_SPAN_DAYS) {
    return {
      trendWeight,
      ratePerWeek: null,
      daysToGoal: null,
      status: 'insufficient-data',
    };
  }

  const meanX = window.reduce((sum, p) => sum + p.x, 0) / window.length;
  const meanY = window.reduce((sum, p) => sum + p.y, 0) / window.length;
  let covariance = 0;
  let variance = 0;
  for (const p of window) {
    covariance += (p.x - meanX) * (p.y - meanY);
    variance += (p.x - meanX) ** 2;
  }
  const ratePerDay = covariance / variance;
  const ratePerWeek = ratePerDay * 7;

  if (goal == null || !(goal > 0)) {
    return { trendWeight, ratePerWeek, daysToGoal: null, status: 'no-goal' };
  }
  if (Math.abs(ratePerWeek) < trendWeight * FLAT_RATE_FRACTION_PER_WEEK) {
    return { trendWeight, ratePerWeek, daysToGoal: null, status: 'steady' };
  }

  const remaining = goal - trendWeight;
  if (remaining * ratePerDay <= 0) {
    // Already at or past the goal counts as heading there with nothing left to go.
    return remaining === 0
      ? { trendWeight, ratePerWeek, daysToGoal: 0, status: 'toward-goal' }
      : {
          trendWeight,
          ratePerWeek,
          daysToGoal: null,
          status: 'away-from-goal',
        };
  }

  const daysToGoal = Math.ceil(remaining / ratePerDay);
  if (daysToGoal > MAX_FORECAST_DAYS) {
    return { trendWeight, ratePerWeek, daysToGoal: null, status: 'too-far' };
  }
  return { trendWeight, ratePerWeek, daysToGoal, status: 'toward-goal' };
}
