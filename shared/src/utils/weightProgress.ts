import { z } from 'zod';
import {
  ENERGY_DENSITY_KCAL_PER_KG,
  FAT_KCAL_PER_KG,
  QUALIFYING_FOOD_LOG_MIN_KCAL,
} from '../constants/calorieConstants.ts';
import { KG_PER_LB } from './exerciseLoad.ts';
import { addDays, compareDays, isDayString } from './timezone.ts';
import { computeDailyWeightTrend, type WeightSample } from './weightTrend.ts';

// Weight progress (start point, change, share of the way to goal), milestones,
// the fat a logged energy deficit implies, and waist-to-height ratio. Web and
// mobile both draw these; all weights are kg and lengths cm, as stored.
// Every figure is read from the smoothed trend (`weightTrend.ts`), never from a
// single scale reading, so one heavy morning does not undo a milestone.

export interface DailyTrendPoint {
  /** YYYY-MM-DD calendar day. */
  date: string;
  trend: number;
}

// ---------------------------------------------------------------------------
// Start point
// ---------------------------------------------------------------------------

/** Where the starting weight came from. */
export type WeightProgressStartSource =
  'custom' | 'first_measurement' | 'onboarding';

export interface WeightProgressStart {
  /** YYYY-MM-DD. */
  date: string;
  /** kg. */
  weight: number;
  source: WeightProgressStartSource;
}

/** A start the person chose: a day, and optionally the weight on it. */
export interface CustomWeightProgressStart {
  date: string;
  /** kg; when absent the trend on `date` is used. */
  weight?: number | null;
}

const isPositive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The trend on `date`, or the nearest trend day when `date` is outside them. */
export function trendOnDay(
  daily: readonly DailyTrendPoint[],
  date: string
): number | null {
  if (daily.length === 0) return null;
  const first = daily[0]!;
  if (compareDays(date, first.date) <= 0) return first.trend;
  const last = daily[daily.length - 1]!;
  if (compareDays(date, last.date) >= 0) return last.trend;
  const found = daily.find((p) => p.date === date);
  return found ? found.trend : null;
}

/**
 * The starting weight. A custom start wins; otherwise the earliest of the first
 * weigh-in and the onboarding weight. With no weigh-ins at all the onboarding
 * weight is used if there is one.
 */
export function resolveWeightProgressStart(input: {
  samples: readonly WeightSample[];
  custom?: CustomWeightProgressStart | null;
  onboardingWeight?: number | null;
  /** YYYY-MM-DD the onboarding weight was given. */
  onboardingDate?: string | null;
}): WeightProgressStart | null {
  const daily = computeDailyWeightTrend(input.samples);
  const custom = input.custom;
  if (custom && isDayString(custom.date)) {
    const weight = isPositive(custom.weight)
      ? custom.weight
      : trendOnDay(daily, custom.date);
    if (weight !== null) {
      return { date: custom.date, weight, source: 'custom' };
    }
  }

  const first = daily[0];
  const onboardingDate =
    input.onboardingDate && isDayString(input.onboardingDate)
      ? input.onboardingDate
      : null;
  if (isPositive(input.onboardingWeight) && onboardingDate) {
    if (!first || compareDays(onboardingDate, first.date) < 0) {
      return {
        date: onboardingDate,
        weight: input.onboardingWeight,
        source: 'onboarding',
      };
    }
  }
  if (!first) return null;
  return { date: first.date, weight: first.trend, source: 'first_measurement' };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type ProgressGoalDirection = 'lose' | 'gain';

export interface WeightGoalProgress {
  /** kg. */
  target: number;
  direction: ProgressGoalDirection;
  /** 0 to 100: how much of the start-to-goal distance the trend has covered. */
  percentToGoal: number;
  /** kg still to go toward the goal; 0 once reached. */
  remaining: number;
  reached: boolean;
}

export interface WeightProgress {
  start: WeightProgressStart;
  /** Latest smoothed weight, kg. */
  currentTrend: number;
  /** YYYY-MM-DD of `currentTrend`. */
  currentDate: string;
  /** Trend minus start, kg: negative is a loss. */
  totalChange: number;
  /** `totalChange` as a share of the starting weight, signed percent. */
  percentChange: number;
  /** Null without a goal, or when the goal is the starting weight. */
  goal: WeightGoalProgress | null;
}

/** Direction of a goal from a start; null when there is no usable goal. */
export function progressGoalDirection(
  startWeight: number,
  target: number | null | undefined
): ProgressGoalDirection | null {
  if (!isPositive(target) || target === startWeight) return null;
  return target < startWeight ? 'lose' : 'gain';
}

/** Progress from `start` to the latest trend, and toward `target` if set. */
export function computeWeightProgress(input: {
  samples: readonly WeightSample[];
  start: WeightProgressStart | null;
  target?: number | null;
}): WeightProgress | null {
  const { start } = input;
  if (!start) return null;
  const daily = computeDailyWeightTrend(input.samples);
  const last = daily[daily.length - 1];
  if (!last) return null;

  const totalChange = last.trend - start.weight;
  const direction = progressGoalDirection(start.weight, input.target);
  let goal: WeightGoalProgress | null = null;
  if (direction && isPositive(input.target)) {
    const distance = Math.abs(start.weight - input.target);
    const covered =
      direction === 'lose'
        ? start.weight - last.trend
        : last.trend - start.weight;
    const reached = covered >= distance;
    goal = {
      target: input.target,
      direction,
      percentToGoal: Math.min(100, Math.max(0, (covered / distance) * 100)),
      remaining: reached ? 0 : distance - Math.max(0, covered),
      reached,
    };
  }
  return {
    start,
    currentTrend: last.trend,
    currentDate: last.date,
    totalChange,
    percentChange: (totalChange / start.weight) * 100,
    goal,
  };
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export type WeightMilestoneKind = 'amount' | 'percent' | 'halfway' | 'goal';

/** The display unit amount milestones are counted in. */
export type WeightMilestoneUnit = 'kg' | 'lbs';

/** Amount milestones: every 5 kg, or every 10 lb. */
export const WEIGHT_MILESTONE_STEP = { kg: 5, lbs: 10 } as const;
/** Percent-of-starting-weight milestones. */
export const WEIGHT_MILESTONE_PERCENTS = [5, 10, 15, 20, 25, 30] as const;
/** Without a goal, amount milestones are offered up to this many steps. */
const MAX_OPEN_AMOUNT_STEPS = 20;

export interface WeightMilestone {
  /** Stable id, e.g. `amount:10:lbs`, `percent:5`, `halfway`, `goal`. */
  id: string;
  kind: WeightMilestoneKind;
  /** Amount in `unit` for `amount`, percent for `percent`, else null. */
  value: number | null;
  /** kg of change from the start in the milestone's direction. */
  amountKg: number;
  /** First day the trend reached it; null when not reached yet. */
  achievedOn: string | null;
}

export interface WeightMilestoneSummary {
  direction: ProgressGoalDirection;
  achieved: WeightMilestone[];
  next: WeightMilestone | null;
  /** kg still to go to `next`. */
  toNext: number | null;
}

/**
 * Milestones from the start toward the goal (or in the direction the trend has
 * moved, without a goal; a loss when it has not moved). A milestone counts as
 * reached on the first day the trend crossed it and stays reached.
 */
export function computeWeightMilestones(input: {
  samples: readonly WeightSample[];
  start: WeightProgressStart | null;
  target?: number | null;
  unit: WeightMilestoneUnit;
}): WeightMilestoneSummary | null {
  const { start } = input;
  if (!start) return null;
  const daily = computeDailyWeightTrend(input.samples).filter(
    (p) => compareDays(p.date, start.date) >= 0
  );
  const last = daily[daily.length - 1];
  if (!last) return null;

  const goalDirection = progressGoalDirection(start.weight, input.target);
  const direction: ProgressGoalDirection =
    goalDirection ?? (last.trend > start.weight ? 'gain' : 'lose');
  const progressOf = (trend: number) =>
    direction === 'lose' ? start.weight - trend : trend - start.weight;
  const goalDistance =
    goalDirection && isPositive(input.target)
      ? Math.abs(start.weight - input.target)
      : null;

  const candidates: Omit<WeightMilestone, 'achievedOn'>[] = [];
  const step = WEIGHT_MILESTONE_STEP[input.unit];
  const stepKg = input.unit === 'kg' ? step : step * KG_PER_LB;
  const maxSteps =
    goalDistance !== null
      ? Math.ceil(goalDistance / stepKg) - 1
      : MAX_OPEN_AMOUNT_STEPS;
  for (let k = 1; k <= maxSteps; k++) {
    const amountKg = k * stepKg;
    if (goalDistance !== null && amountKg >= goalDistance) break;
    candidates.push({
      id: `amount:${k * step}:${input.unit}`,
      kind: 'amount',
      value: k * step,
      amountKg,
    });
  }
  for (const percent of WEIGHT_MILESTONE_PERCENTS) {
    const amountKg = (start.weight * percent) / 100;
    if (goalDistance !== null && amountKg >= goalDistance) break;
    candidates.push({
      id: `percent:${percent}`,
      kind: 'percent',
      value: percent,
      amountKg,
    });
  }
  if (goalDistance !== null) {
    candidates.push({
      id: 'halfway',
      kind: 'halfway',
      value: null,
      amountKg: goalDistance / 2,
    });
    candidates.push({
      id: 'goal',
      kind: 'goal',
      value: null,
      amountKg: goalDistance,
    });
  }
  candidates.sort((a, b) => a.amountKg - b.amountKg);

  const milestones: WeightMilestone[] = candidates.map((m) => ({
    ...m,
    // A hair of tolerance so a trend sitting exactly on the line counts.
    achievedOn:
      daily.find((p) => progressOf(p.trend) >= m.amountKg - 1e-9)?.date ?? null,
  }));
  const achieved = milestones.filter((m) => m.achievedOn !== null);
  const next = milestones.find((m) => m.achievedOn === null) ?? null;
  return {
    direction,
    achieved,
    next,
    toNext: next ? Math.max(0, next.amountKg - progressOf(last.trend)) : null,
  };
}

/** What a device remembers about milestones it has already shown. */
export interface SeenWeightMilestones {
  /** The start these ids belong to; a new start forgets them. */
  startDate: string;
  ids: string[];
}

/**
 * Milestones reached since the device last looked, to celebrate once. With
 * nothing remembered for this start (first view, or a new start), nothing is
 * celebrated: what was already reached is simply shown.
 */
export function milestonesToCelebrate(
  achieved: readonly WeightMilestone[],
  startDate: string,
  seen: SeenWeightMilestones | null | undefined
): WeightMilestone[] {
  if (!seen || seen.startDate !== startDate) return [];
  const known = new Set(seen.ids);
  return achieved.filter((m) => !known.has(m.id));
}

// ---------------------------------------------------------------------------
// Fat lost from the logged energy balance (#1992)
// ---------------------------------------------------------------------------

/** Days the energy-balance estimate looks back over, at most. */
export const ENERGY_BALANCE_WINDOW_DAYS = 90;
/** Days with a real food log needed before the estimate is shown. */
export const ENERGY_BALANCE_MIN_LOGGED_DAYS = 7;

export interface DailyIntake {
  /** YYYY-MM-DD. */
  date: string;
  /** kcal eaten that day. */
  calories: number;
}

export interface EnergyBalanceEstimate {
  from: string;
  to: string;
  /** Days in the window with a qualifying food log. */
  loggedDays: number;
  /** Days in the window. */
  windowDays: number;
  /** Sum of (expenditure - intake) over logged days, kcal; positive is a deficit. */
  deficitKcal: number;
  /** The deficit as pure fat tissue, kg (positive = lost). */
  estimatedFatKg: number;
  /** The scale change the deficit predicts at the app's mixed density, kg (negative = loss). */
  predictedChangeKg: number;
  /** Trend change over the same window, kg; null without two trend days in it. */
  actualChangeKg: number | null;
  /** True once there are enough logged days to show the figure. */
  enough: boolean;
}

/**
 * The window the estimate covers: up to `ENERGY_BALANCE_WINDOW_DAYS` ending
 * yesterday (today's log is not finished), never before the start.
 */
export function energyBalanceWindow(
  today: string,
  startDate: string | null | undefined
): { from: string; to: string } {
  const to = addDays(today, -1);
  let from = addDays(to, -(ENERGY_BALANCE_WINDOW_DAYS - 1));
  if (startDate && compareDays(startDate, from) > 0) from = startDate;
  if (compareDays(from, to) > 0) from = to;
  return { from, to };
}

/**
 * Fat a logged energy deficit implies, beside the trend's actual change.
 *
 * Only days with a real food log count (at least `QUALIFYING_FOOD_LOG_MIN_KCAL`):
 * an unlogged day is unknown, not zero, and counting it as zero would invent a
 * deficit. Expenditure is one daily figure (the Adaptive TDEE estimate). Pure
 * fat uses `FAT_KCAL_PER_KG`; the predicted scale change uses the app's mixed
 * `ENERGY_DENSITY_KCAL_PER_KG`. Both are estimates.
 */
export function estimateFatFromEnergyBalance(input: {
  intake: readonly DailyIntake[];
  expenditureKcal: number | null | undefined;
  from: string;
  to: string;
  samples: readonly WeightSample[];
}): EnergyBalanceEstimate | null {
  const { from, to } = input;
  if (!isPositive(input.expenditureKcal) || compareDays(from, to) > 0) {
    return null;
  }
  const byDay = new Map<string, number>();
  for (const day of input.intake) {
    if (!isDayString(day.date) || !Number.isFinite(day.calories)) continue;
    if (compareDays(day.date, from) < 0 || compareDays(day.date, to) > 0) {
      continue;
    }
    byDay.set(day.date, (byDay.get(day.date) ?? 0) + day.calories);
  }
  let loggedDays = 0;
  let deficitKcal = 0;
  for (const calories of byDay.values()) {
    if (calories < QUALIFYING_FOOD_LOG_MIN_KCAL) continue;
    loggedDays++;
    deficitKcal += input.expenditureKcal - calories;
  }
  let windowDays = 0;
  for (let d = from; compareDays(d, to) <= 0; d = addDays(d, 1)) windowDays++;

  return {
    from,
    to,
    loggedDays,
    windowDays,
    deficitKcal,
    estimatedFatKg: deficitKcal / FAT_KCAL_PER_KG,
    predictedChangeKg: -deficitKcal / ENERGY_DENSITY_KCAL_PER_KG,
    actualChangeKg: trendChangeBetween(input.samples, from, to),
    enough: loggedDays >= ENERGY_BALANCE_MIN_LOGGED_DAYS,
  };
}

/** Trend change between two days, clipped to the trend's own span. */
export function trendChangeBetween(
  samples: readonly WeightSample[],
  from: string,
  to: string
): number | null {
  const inWindow = computeDailyWeightTrend(samples).filter(
    (p) => compareDays(p.date, from) >= 0 && compareDays(p.date, to) <= 0
  );
  if (inWindow.length < 2) return null;
  return inWindow[inWindow.length - 1]!.trend - inWindow[0]!.trend;
}

// ---------------------------------------------------------------------------
// Waist-to-height ratio
// ---------------------------------------------------------------------------

/**
 * Reference bands for waist-to-height ratio (NICE 2022 adult guidance): under
 * 0.5 is the lower-risk band, 0.5 to under 0.6 increased, 0.6 and over high.
 * They are population screening bands, not a diagnosis.
 */
export const WAIST_TO_HEIGHT_BANDS = [
  { band: 'lower', min: 0, max: 0.5 },
  { band: 'increased', min: 0.5, max: 0.6 },
  { band: 'high', min: 0.6, max: Number.POSITIVE_INFINITY },
] as const;

export type WaistToHeightBand = (typeof WAIST_TO_HEIGHT_BANDS)[number]['band'];

/**
 * Waist divided by height. Both must be in the same unit (cm and cm, or inches
 * and inches); the ratio itself has no unit.
 */
export function waistToHeightRatio(
  waist: number | null | undefined,
  height: number | null | undefined
): number | null {
  if (!isPositive(waist) || !isPositive(height)) return null;
  return waist / height;
}

export function waistToHeightBand(ratio: number): WaistToHeightBand {
  for (const b of WAIST_TO_HEIGHT_BANDS) {
    if (ratio < b.max) return b.band;
  }
  return 'high';
}

export interface BodyMeasurementDay {
  /** YYYY-MM-DD. */
  date: string;
  /** cm. */
  waist?: number | string | null;
  /** cm. */
  height?: number | string | null;
}

export interface WaistToHeightPoint {
  date: string;
  ratio: number;
  band: WaistToHeightBand;
  /** cm, as used. */
  waist: number;
  height: number;
}

const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return isPositive(n) ? n : null;
};

/**
 * One ratio per day with a waist measurement. Height is rarely logged, so each
 * waist uses the latest height on or before its day, else the earliest height
 * after it. Sorted by date.
 */
export function waistToHeightSeries(
  days: readonly BodyMeasurementDay[]
): WaistToHeightPoint[] {
  const sorted = [...days]
    .filter((d) => isDayString(d.date))
    .sort((a, b) => compareDays(a.date, b.date));
  const heights = sorted.flatMap((d) => {
    const h = toNumber(d.height);
    return h === null ? [] : [{ date: d.date, height: h }];
  });
  if (heights.length === 0) return [];

  const points: WaistToHeightPoint[] = [];
  for (const day of sorted) {
    const waist = toNumber(day.waist);
    if (waist === null) continue;
    let height = heights[0]!.height;
    for (const h of heights) {
      if (compareDays(h.date, day.date) > 0) break;
      height = h.height;
    }
    const ratio = waist / height;
    points.push({
      date: day.date,
      ratio,
      band: waistToHeightBand(ratio),
      waist,
      height,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// The card's choices, kept on each device (web: localStorage per person;
// mobile: AsyncStorage per server)
// ---------------------------------------------------------------------------

export interface WeightProgressSettings {
  /** A start the person chose; null means the default start. */
  customStart: CustomWeightProgressStart | null;
  /** Milestones and their celebration switched off. */
  milestonesHidden: boolean;
  /** Milestones already shown, so each is celebrated once. */
  seen: SeenWeightMilestones | null;
}

export const DEFAULT_WEIGHT_PROGRESS_SETTINGS: WeightProgressSettings = {
  customStart: null,
  milestonesHidden: false,
  seen: null,
};

const storedWeightProgressSettingsSchema = z.object({
  customStart: z
    .object({
      date: z.string().refine(isDayString),
      weight: z.number().positive().nullish(),
    })
    .nullish()
    .catch(null),
  milestonesHidden: z.boolean().optional().catch(false),
  seen: z
    .object({ startDate: z.string(), ids: z.array(z.string()) })
    .nullish()
    .catch(null),
});

/** Stored settings read back; anything unreadable falls back to the defaults. */
export function parseWeightProgressSettings(
  value: unknown
): WeightProgressSettings {
  const parsed = storedWeightProgressSettingsSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_WEIGHT_PROGRESS_SETTINGS;
  return {
    customStart: parsed.data.customStart ?? null,
    milestonesHidden: parsed.data.milestonesHidden === true,
    seen: parsed.data.seen ?? null,
  };
}
