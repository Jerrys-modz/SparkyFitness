import { addDays, compareDays, daysBetween } from './timezone.ts';

// Smoothed weight trend: logged weights are linearly interpolated onto every
// calendar day, then averaged over a trailing 7-day window. This is the same
// smoothing the server's adaptive TDEE uses, so the trend line a user sees
// matches the trend the calorie target is built from.
//
// The smoothing, rate and goal forecast are not weight-specific: any daily
// body measurement with a target (body fat %, for one) goes through the
// `TrendSample` / `TrendPoint` versions below. The weight names are kept as
// thin wrappers for the callers that already use them.

const TREND_WINDOW_DAYS = 7;
/** Trend days used to fit the current rate of change. */
const RATE_WINDOW_DAYS = 14;
/** Minimum span and weigh-ins before a rate or forecast is trusted. */
const MIN_FORECAST_SPAN_DAYS = 14;
const MIN_FORECAST_WEIGH_INS = 4;
/** Forecasts further out than this are noise, not a plan. */
const MAX_FORECAST_DAYS = 730;

/** A daily reading of any positive measurement (weight, body fat %, ...). */
export interface TrendSample {
  /** YYYY-MM-DD calendar day. */
  date: string;
  /** Any consistent unit; outputs stay in the same unit. */
  value: number;
}

/** The smoothed value on one day; all the rate and forecast helpers need. */
export interface TrendPoint {
  /** YYYY-MM-DD calendar day. */
  date: string;
  /** Smoothed value on this day, same unit as the input. */
  trend: number;
}

export interface MeasurementTrendPoint extends TrendSample, TrendPoint {}

export interface WeightSample {
  /** YYYY-MM-DD calendar day. */
  date: string;
  /** Any consistent unit; outputs stay in the same unit. */
  weight: number;
}

export interface WeightTrendPoint extends WeightSample {
  /** Smoothed weight on this day, same unit as the input. */
  trend: number;
}

export interface WeightTrendSummary {
  /** Latest smoothed value. */
  currentTrend: number;
  /** Change per week over the last two weeks of trend; null if too little data. */
  weeklyRate: number | null;
}

export interface GoalForecast {
  /** Projected YYYY-MM-DD the trend reaches the target, if it stays on course. */
  date: string;
  daysRemaining: number;
}

function sortedLogged(samples: readonly TrendSample[]): TrendSample[] {
  const byDay = new Map<string, number>();
  for (const s of samples) {
    if (Number.isFinite(s.value) && s.value > 0) byDay.set(s.date, s.value);
  }
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => compareDays(a.date, b.date));
}

/** Trend for every calendar day from `logged[0]` to the last entry (`logged` sorted, deduped). */
function dailyTrendOf(logged: readonly TrendSample[]): number[] {
  if (logged.length === 0) return [];
  const first = logged[0]!.date;
  const span = daysBetween(first, logged[logged.length - 1]!.date);

  // Interpolate onto each day between the first and last weigh-in.
  const daily: number[] = new Array<number>(span + 1);
  for (let i = 0; i < logged.length; i++) {
    const cur = logged[i]!;
    const curIdx = daysBetween(first, cur.date);
    daily[curIdx] = cur.value;
    const next = logged[i + 1];
    if (!next) continue;
    const gap = daysBetween(cur.date, next.date);
    for (let d = 1; d < gap; d++) {
      daily[curIdx + d] = cur.value + ((next.value - cur.value) * d) / gap;
    }
  }

  return daily.map((_, i) => {
    const from = Math.max(0, i - TREND_WINDOW_DAYS + 1);
    let sum = 0;
    for (let j = from; j <= i; j++) sum += daily[j]!;
    return sum / (i - from + 1);
  });
}

/**
 * Smoothed trend for each logged day of any measurement. Duplicate days keep
 * the last entry and non-finite or non-positive values are ignored. Output is
 * sorted by date.
 */
export function computeMeasurementTrend(
  samples: readonly TrendSample[]
): MeasurementTrendPoint[] {
  const logged = sortedLogged(samples);
  if (logged.length === 0) return [];
  const first = logged[0]!.date;
  const trendByIdx = dailyTrendOf(logged);
  return logged.map((s) => ({
    ...s,
    trend: trendByIdx[daysBetween(first, s.date)]!,
  }));
}

const toTrendSamples = (samples: readonly WeightSample[]): TrendSample[] =>
  samples.map((s) => ({ date: s.date, value: s.weight }));

/** `computeMeasurementTrend` for weigh-ins, keeping the `weight` field name. */
export function computeWeightTrend(
  samples: readonly WeightSample[]
): WeightTrendPoint[] {
  return computeMeasurementTrend(toTrendSamples(samples)).map((p) => ({
    date: p.date,
    weight: p.value,
    trend: p.trend,
  }));
}

/** The smoothed trend on every calendar day from the first to the last weigh-in. */
export function computeDailyWeightTrend(
  samples: readonly WeightSample[]
): { date: string; trend: number }[] {
  const logged = sortedLogged(toTrendSamples(samples));
  if (logged.length === 0) return [];
  const first = logged[0]!.date;
  return dailyTrendOf(logged).map((trend, i) => ({
    date: addDays(first, i),
    trend,
  }));
}

/** Current trend value and per-week rate of change from a computed trend. */
export function summarizeWeightTrend(
  points: readonly TrendPoint[]
): WeightTrendSummary | null {
  const last = points[points.length - 1];
  if (!last) return null;
  return { currentTrend: last.trend, weeklyRate: weeklyRateOf(points) };
}

function weeklyRateOf(points: readonly TrendPoint[]): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const cutoff = addDays(last.date, -RATE_WINDOW_DAYS);
  const window = points.filter((p) => compareDays(p.date, cutoff) >= 0);
  if (window.length < MIN_FORECAST_WEIGH_INS) return null;
  const firstDay = window[0]!.date;
  if (daysBetween(firstDay, last.date) < MIN_FORECAST_SPAN_DAYS - 1)
    return null;

  // Least-squares slope of trend against day offset.
  const xs = window.map((p) => daysBetween(firstDay, p.date));
  const n = window.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = window.reduce((a, p) => a + p.trend, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (window[i]!.trend - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

/** Why a goal forecast is, or is not, available. */
export type GoalForecastStatus =
  | 'insufficient-data'
  | 'no-goal'
  | 'steady'
  | 'toward-goal'
  | 'away-from-goal'
  | 'too-far';

export interface GoalForecastAssessment {
  status: GoalForecastStatus;
  /** Only when `status` is `toward-goal`. */
  forecast: GoalForecast | null;
}

/** A weekly change under this share of the trend value reads as holding steady. */
const FLAT_RATE_FRACTION_PER_WEEK = 0.0005;

/**
 * Where the trend of any measurement (weight, body fat %, ...) stands against
 * `target`, in the same unit: heading there (with the projected
 * date), holding steady, moving away, too far out to call, or not enough data.
 * Callers that only want the date use `forecastGoalDate`.
 */
export function assessGoalForecast(
  points: readonly TrendPoint[],
  target: number | null | undefined
): GoalForecastAssessment {
  const last = points[points.length - 1];
  const rate = weeklyRateOf(points);
  if (!last || rate === null) {
    return { status: 'insufficient-data', forecast: null };
  }
  if (target == null || !Number.isFinite(target) || target <= 0) {
    return { status: 'no-goal', forecast: null };
  }
  if (Math.abs(rate) < last.trend * FLAT_RATE_FRACTION_PER_WEEK) {
    return { status: 'steady', forecast: null };
  }

  const remaining = target - last.trend;
  // Already at the target: nothing left to project.
  if (remaining === 0) return { status: 'steady', forecast: null };
  if (Math.sign(remaining) !== Math.sign(rate)) {
    return { status: 'away-from-goal', forecast: null };
  }

  const daysRemaining = Math.ceil((remaining / rate) * 7);
  if (daysRemaining <= 0) return { status: 'steady', forecast: null };
  if (daysRemaining > MAX_FORECAST_DAYS) {
    return { status: 'too-far', forecast: null };
  }
  return {
    status: 'toward-goal',
    forecast: { date: addDays(last.date, daysRemaining), daysRemaining },
  };
}

/**
 * Projects when the trend reaches `target` at the current rate. Returns null
 * when there is too little data, the trend is flat or moving away from the
 * target, the target is already reached, or the date is over two years out.
 */
export function forecastGoalDate(
  points: readonly TrendPoint[],
  target: number | null | undefined
): GoalForecast | null {
  return assessGoalForecast(points, target).forecast;
}

// ---------------------------------------------------------------------------
// Plateau detection
//
// A plateau is a stretch where the smoothed trend has stopped moving while the
// person's goal is to lose or gain. It is judged on the same daily trend the
// chart draws, so a single heavy or light weigh-in (water, salt, a late meal)
// cannot start or end one. Thresholds are deliberately conservative: the card
// this feeds is informative, never a judgement, so it should only appear when
// the trend has clearly been flat for a while.
// ---------------------------------------------------------------------------

/** Which way the person's goal wants the trend to move. */
export type WeightGoalDirection = 'lose' | 'gain' | 'none';

/** The trend must have been flat for at least this many days, inclusive. */
export const PLATEAU_MIN_DAYS = 14;
/** Real weigh-ins needed inside the flat stretch, so interpolation alone never makes one. */
export const PLATEAU_MIN_WEIGH_INS = 6;
/** A gap between weigh-ins longer than this ends the stretch: too little data to call it flat. */
export const PLATEAU_MAX_GAP_DAYS = 7;
/**
 * Flat means the weekly rate of the trend over the stretch is under this share
 * of the trend weight: 0.1% per week, about 0.08 kg (0.18 lb) at 80 kg. Slower
 * than any loss or gain rate the goal modes aim for.
 */
export const PLATEAU_RATE_FRACTION_PER_WEEK = 0.001;
/**
 * The trend must also stay inside a band this share of the trend weight wide
 * (0.5%, about 0.4 kg at 80 kg), so a drop that bounced back is not called flat.
 */
export const PLATEAU_BAND_FRACTION = 0.005;
/** A plateau is only current when the last weigh-in is at most this many days before `today`. */
export const PLATEAU_MAX_STALE_DAYS = 7;

export interface WeightPlateau {
  /** First YYYY-MM-DD day of the flat stretch. */
  startDate: string;
  /** Last weigh-in of the flat stretch. */
  endDate: string;
  /** Length of the stretch in days, inclusive of both ends. */
  days: number;
  /** Weigh-ins logged inside the stretch. */
  weighIns: number;
  /** Trend change per week across the stretch, in the input unit. */
  weeklyRate: number;
  /** Latest smoothed weight, in the input unit. */
  currentTrend: number;
  direction: Exclude<WeightGoalDirection, 'none'>;
}

export interface WeightPlateauOptions {
  /** Today's YYYY-MM-DD in the person's timezone; enables the staleness check. */
  today?: string;
}

interface GoalModeSettings {
  goal_mode?: string | null;
  goal_mode_custom_percentage?: number | null;
  goal_mode_weekly_change_kg?: number | null;
}

/**
 * The direction a Goal Mode asks the weight to move. Maintain and recomp are
 * `none`: recomposition aims to change body composition at a steady weight, so
 * a flat trend is expected there. Manual and weekly follow the sign the person
 * chose (a positive manual percentage is a surplus, a negative weekly change is
 * a loss).
 */
export function weightGoalDirection(
  settings: GoalModeSettings | null | undefined
): WeightGoalDirection {
  switch (settings?.goal_mode) {
    case 'cut':
    case 'high_cut':
      return 'lose';
    case 'lean_bulk':
    case 'bulk':
      return 'gain';
    case 'manual': {
      const pct = Number(settings.goal_mode_custom_percentage ?? 0);
      if (!Number.isFinite(pct) || pct === 0) return 'none';
      return pct > 0 ? 'gain' : 'lose';
    }
    case 'weekly': {
      const kg = Number(settings.goal_mode_weekly_change_kg ?? 0);
      if (!Number.isFinite(kg) || kg === 0) return 'none';
      return kg > 0 ? 'gain' : 'lose';
    }
    default:
      return 'none';
  }
}

/** Least-squares slope per day of `values` against their index. */
function slopePerDay(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i]! - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * The current weight plateau, or null when there is none. Looks back from the
 * last weigh-in for the longest stretch whose daily trend stays inside a narrow
 * band and whose weekly rate is near zero, and calls it a plateau when it
 * covers at least `PLATEAU_MIN_DAYS` with `PLATEAU_MIN_WEIGH_INS` real
 * weigh-ins and no gap over `PLATEAU_MAX_GAP_DAYS`. Always null for a `none`
 * direction (maintenance or recomposition) and, when `today` is given, when the
 * last weigh-in is more than `PLATEAU_MAX_STALE_DAYS` old.
 */
export function detectWeightPlateau(
  samples: readonly WeightSample[],
  direction: WeightGoalDirection,
  options: WeightPlateauOptions = {}
): WeightPlateau | null {
  if (direction === 'none') return null;
  const logged = sortedLogged(toTrendSamples(samples));
  if (logged.length < PLATEAU_MIN_WEIGH_INS) return null;
  const first = logged[0]!.date;
  const last = logged[logged.length - 1]!;
  if (
    options.today &&
    daysBetween(last.date, options.today) > PLATEAU_MAX_STALE_DAYS
  ) {
    return null;
  }

  const trend = dailyTrendOf(logged);
  const end = trend.length - 1;
  const currentTrend = trend[end]!;
  const maxRate = currentTrend * PLATEAU_RATE_FRACTION_PER_WEEK;
  const maxBand = currentTrend * PLATEAU_BAND_FRACTION;

  // Earliest day index each stretch may reach: a long gap between weigh-ins
  // ends it at the later weigh-in of that gap.
  let earliest = 0;
  for (let i = logged.length - 1; i > 0; i--) {
    if (
      daysBetween(logged[i - 1]!.date, logged[i]!.date) > PLATEAU_MAX_GAP_DAYS
    ) {
      earliest = daysBetween(first, logged[i]!.date);
      break;
    }
  }

  let lo = currentTrend;
  let hi = currentTrend;
  let best: { start: number; rate: number } | null = null;
  for (let start = end; start >= earliest; start--) {
    const value = trend[start]!;
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
    // The band only widens going back, so nothing earlier can qualify.
    if (hi - lo > maxBand) break;
    if (end - start + 1 < PLATEAU_MIN_DAYS) continue;
    const rate = slopePerDay(trend.slice(start)) * 7;
    if (Math.abs(rate) < maxRate) best = { start, rate };
  }
  if (!best) return null;

  const startDate = addDays(first, best.start);
  const weighIns = logged.filter(
    (s) => compareDays(s.date, startDate) >= 0
  ).length;
  if (weighIns < PLATEAU_MIN_WEIGH_INS) return null;

  return {
    startDate,
    endDate: last.date,
    days: end - best.start + 1,
    weighIns,
    weeklyRate: best.rate,
    currentTrend,
    direction,
  };
}

/**
 * Whether a plateau the person dismissed is still the one showing. Apps store
 * the dismissed plateau's `endDate`; the card stays hidden while the current
 * plateau began on or before that day (the same flat stretch, now longer) and
 * shows again for a new plateau that starts after it.
 */
export function isWeightPlateauDismissed(
  plateau: Pick<WeightPlateau, 'startDate'>,
  dismissedEndDate: string | null | undefined
): boolean {
  return (
    !!dismissedEndDate && compareDays(plateau.startDate, dismissedEndDate) <= 0
  );
}
