/**
 * Carbohydrate fueling plan for a long run or race.
 *
 * Targets follow the sports dietitians' position stand (Thomas et al., 2016):
 * little or nothing under an hour, 30-60 g/h from one to two and a half hours,
 * and up to 90 g/h beyond that. Everything here is a starting point the person
 * can override; it is general guidance, not medical advice.
 */

export type FuelingExperience = 'beginner' | 'intermediate' | 'advanced';

/** Effort as a heart rate zone, 1 (easy) to 5 (maximal). */
export type FuelingIntensityZone = 1 | 2 | 3 | 4 | 5;

export const FUELING_SHORT_SESSION_MIN = 60;
export const FUELING_LONG_SESSION_MIN = 150;
export const FUELING_DEFAULT_PORTION_GRAMS = 25;
export const FUELING_FIRST_REMINDER_MAX_MIN = 45;
export const FUELING_MAX_CARBS_PER_HOUR = 120;
export const FUELING_MAX_PORTION_GRAMS = 100;

/** Highest g/h suggested by default for each level of gut training. */
export const FUELING_EXPERIENCE_CAPS: Record<FuelingExperience, number> = {
  beginner: 45,
  intermediate: 60,
  advanced: 90,
};

export interface FuelingOverrides {
  carbsPerHour?: number | null;
  portionGrams?: number | null;
}

export interface FuelingPlanInput {
  durationMin: number;
  intensityZone?: FuelingIntensityZone;
  experience?: FuelingExperience;
  overrides?: FuelingOverrides;
}

export interface FuelingPlan {
  /** Whether the session is long enough that fueling is suggested at all. */
  needsFuel: boolean;
  carbsPerHour: number;
  portionGrams: number;
  /** Minutes between portions; null when no fueling is planned. */
  intervalMin: number | null;
  /** Minutes from the start of each reminder. */
  reminderOffsetsMin: number[];
  totalCarbsGrams: number;
  /** The default g/h range for this duration, before overrides. */
  range: { min: number; max: number };
  carbsPerHourOverridden: boolean;
}

const EMPTY_RANGE = { min: 0, max: 0 } as const;

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** The default g/h range for a session of this length. */
export function fuelingCarbRange(durationMin: number): {
  min: number;
  max: number;
} {
  if (!(durationMin >= FUELING_SHORT_SESSION_MIN)) return { ...EMPTY_RANGE };
  if (durationMin <= FUELING_LONG_SESSION_MIN) return { min: 30, max: 60 };
  return { min: 60, max: 90 };
}

/** Where in the range to aim: easy efforts low, hard efforts high. */
const ZONE_POSITION: Record<FuelingIntensityZone, number> = {
  1: 0,
  2: 0.25,
  3: 0.5,
  4: 0.75,
  5: 1,
};

export function computeFuelingPlan(input: FuelingPlanInput): FuelingPlan {
  const durationMin = positive(input.durationMin) ?? 0;
  const zone = input.intensityZone ?? 3;
  const experience = input.experience ?? 'intermediate';
  const range = fuelingCarbRange(durationMin);

  const carbsOverride = positive(input.overrides?.carbsPerHour);
  const portionOverride = positive(input.overrides?.portionGrams);

  let carbsPerHour: number;
  if (carbsOverride !== null) {
    carbsPerHour = Math.min(carbsOverride, FUELING_MAX_CARBS_PER_HOUR);
  } else if (range.max === 0) {
    carbsPerHour = 0;
  } else {
    const aim = range.min + (range.max - range.min) * ZONE_POSITION[zone];
    carbsPerHour = Math.min(aim, FUELING_EXPERIENCE_CAPS[experience]);
    carbsPerHour = Math.round(carbsPerHour / 5) * 5;
  }

  const portionGrams = Math.min(
    portionOverride ?? FUELING_DEFAULT_PORTION_GRAMS,
    FUELING_MAX_PORTION_GRAMS
  );

  const needsFuel = carbsPerHour > 0 && durationMin > 0;
  const intervalMin = needsFuel
    ? Math.max(1, Math.round((60 * portionGrams) / carbsPerHour))
    : null;

  const reminderOffsetsMin: number[] = [];
  if (intervalMin !== null) {
    const first = Math.min(intervalMin, FUELING_FIRST_REMINDER_MAX_MIN);
    for (let t = first; t < durationMin; t += intervalMin) {
      reminderOffsetsMin.push(t);
    }
  }

  return {
    needsFuel,
    carbsPerHour,
    portionGrams,
    intervalMin,
    reminderOffsetsMin,
    totalCarbsGrams: Math.round((carbsPerHour * durationMin) / 60),
    range,
    carbsPerHourOverridden: carbsOverride !== null,
  };
}
