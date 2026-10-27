export const DRINK_DEFAULT_INTERVAL_MIN = 20;
export const DRINK_DEFAULT_ML = 150;
export const DRINK_MIN_INTERVAL_MIN = 5;
export const DRINK_MAX_INTERVAL_MIN = 60;
export const DRINK_MIN_ML = 20;
export const DRINK_MAX_ML = 500;
/** Above this many ml per hour the plan is flagged: drinking more than you lose is a risk. */
export const DRINK_HIGH_ML_PER_HOUR = 800;

export interface DrinkPlanInput {
  durationMin: number;
  intervalMin?: number | null;
  mlPerDrink?: number | null;
}

export interface DrinkPlan {
  intervalMin: number;
  mlPerDrink: number;
  mlPerHour: number;
  /** Minutes from the start of each reminder. */
  reminderOffsetsMin: number[];
  totalMl: number;
  /** True when the plan asks for more than `DRINK_HIGH_ML_PER_HOUR`. */
  high: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function valid(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * A drink every so many minutes. The amounts are the person's own to set: how
 * much anyone loses depends on their sweat rate and the weather, so the
 * defaults (150 ml every 20 minutes, 450 ml an hour) are a starting point and
 * not a target to replace what is lost.
 */
export function computeDrinkPlan(input: DrinkPlanInput): DrinkPlan {
  const durationMin = valid(input.durationMin) ?? 0;
  const intervalMin = Math.round(
    clamp(
      valid(input.intervalMin) ?? DRINK_DEFAULT_INTERVAL_MIN,
      DRINK_MIN_INTERVAL_MIN,
      DRINK_MAX_INTERVAL_MIN
    )
  );
  const mlPerDrink = Math.round(
    clamp(
      valid(input.mlPerDrink) ?? DRINK_DEFAULT_ML,
      DRINK_MIN_ML,
      DRINK_MAX_ML
    )
  );
  const mlPerHour = Math.round((60 * mlPerDrink) / intervalMin);

  const reminderOffsetsMin: number[] = [];
  for (let t = intervalMin; t < durationMin; t += intervalMin) {
    reminderOffsetsMin.push(t);
  }

  return {
    intervalMin,
    mlPerDrink,
    mlPerHour,
    reminderOffsetsMin,
    totalMl: Math.round((mlPerHour * durationMin) / 60),
    high: mlPerHour > DRINK_HIGH_ML_PER_HOUR,
  };
}
