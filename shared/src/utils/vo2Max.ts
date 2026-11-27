/**
 * VO2 max (ml/kg/min) rated against age and sex norms, and a fitness age worked
 * out from the same norms. The single place that reads those norms: web,
 * mobile, the server and the AI tools never keep their own copy.
 *
 * Source: The Cooper Institute norms for VO2 max by age and sex, as printed in
 * Garmin's "VO2 Max. Standard Ratings" tables (data reprinted with permission
 * from The Cooper Institute, www.CooperInstitute.org). Each threshold is the
 * lowest value of its rating: superior is the 95th percentile and up,
 * excellent the 80th, good the 60th, fair the 40th, poor below that.
 *
 * A rating is a rough comparison with the general population, not a medical
 * assessment; the norms start at 20 and end at 79.
 */

export type Vo2MaxSex = 'male' | 'female';

export const VO2_MAX_RATINGS = [
  'poor',
  'fair',
  'good',
  'excellent',
  'superior',
] as const;
export type Vo2MaxRating = (typeof VO2_MAX_RATINGS)[number];

/** Youngest and oldest age the norms cover. */
export const VO2_MAX_NORM_MIN_AGE = 20;
export const VO2_MAX_NORM_MAX_AGE = 79;

interface Vo2MaxBand {
  /** First age of the ten-year band. */
  from: number;
  fair: number;
  good: number;
  excellent: number;
  superior: number;
}

const MALE_BANDS: readonly Vo2MaxBand[] = [
  { from: 20, fair: 41.7, good: 45.4, excellent: 51.1, superior: 55.4 },
  { from: 30, fair: 40.5, good: 44, excellent: 48.3, superior: 54 },
  { from: 40, fair: 38.5, good: 42.4, excellent: 46.4, superior: 52.5 },
  { from: 50, fair: 35.6, good: 39.2, excellent: 43.4, superior: 48.9 },
  { from: 60, fair: 32.3, good: 35.5, excellent: 39.5, superior: 45.7 },
  { from: 70, fair: 29.4, good: 32.3, excellent: 36.7, superior: 42.1 },
];

const FEMALE_BANDS: readonly Vo2MaxBand[] = [
  { from: 20, fair: 36.1, good: 39.5, excellent: 43.9, superior: 49.6 },
  { from: 30, fair: 34.4, good: 37.8, excellent: 42.4, superior: 47.4 },
  { from: 40, fair: 33, good: 36.3, excellent: 39.7, superior: 45.3 },
  { from: 50, fair: 30.1, good: 33, excellent: 36.7, superior: 41.1 },
  { from: 60, fair: 27.5, good: 30, excellent: 33, superior: 37.8 },
  { from: 70, fair: 25.9, good: 28.1, excellent: 30.9, superior: 36.7 },
];

function bandsFor(sex: Vo2MaxSex): readonly Vo2MaxBand[] {
  return sex === 'female' ? FEMALE_BANDS : MALE_BANDS;
}

function bandForAge(sex: Vo2MaxSex, age: number): Vo2MaxBand | null {
  if (!Number.isFinite(age)) return null;
  const whole = Math.floor(age);
  if (whole < VO2_MAX_NORM_MIN_AGE || whole > VO2_MAX_NORM_MAX_AGE) return null;
  return (
    bandsFor(sex).find((b) => whole >= b.from && whole < b.from + 10) ?? null
  );
}

/**
 * Rates a VO2 max for the person's age and sex. Null when the value is not a
 * positive number or the age is outside the norms (20 to 79).
 */
export function rateVo2Max(
  value: number,
  age: number,
  sex: Vo2MaxSex
): Vo2MaxRating | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const band = bandForAge(sex, age);
  if (!band) return null;
  if (value >= band.superior) return 'superior';
  if (value >= band.excellent) return 'excellent';
  if (value >= band.good) return 'good';
  if (value >= band.fair) return 'fair';
  return 'poor';
}

/**
 * The typical (about 50th percentile) VO2 max for one age and sex: halfway
 * between the fair (40th) and good (60th) thresholds, read between the
 * centres of the ten-year bands so it changes smoothly from year to year.
 */
export function typicalVo2Max(age: number, sex: Vo2MaxSex): number | null {
  if (!Number.isFinite(age)) return null;
  if (age < VO2_MAX_NORM_MIN_AGE || age > VO2_MAX_NORM_MAX_AGE) return null;
  const points = typicalPoints(sex);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  if (age <= first.age) return first.value;
  if (age >= last.age) return last.value;
  for (let i = 1; i < points.length; i += 1) {
    const hi = points[i];
    const lo = points[i - 1];
    if (!hi || !lo || age > hi.age) continue;
    const share = (age - lo.age) / (hi.age - lo.age);
    return lo.value + share * (hi.value - lo.value);
  }
  return null;
}

function typicalPoints(sex: Vo2MaxSex): { age: number; value: number }[] {
  return bandsFor(sex).map((b) => ({
    age: b.from + 4.5,
    value: (b.fair + b.good) / 2,
  }));
}

export interface Vo2MaxFitnessAge {
  /** Whole years. */
  age: number;
  /** Set when the value is better or worse than any typical age in the norms, so `age` is the limit. */
  limit: 'younger' | 'older' | null;
}

/**
 * The age at which the person's VO2 max is typical, from the same norms. A
 * rough comparison, not a measurement: it is not the figure a watch maker
 * calls fitness age. Null for a value that is not positive.
 */
export function vo2MaxFitnessAge(
  value: number,
  sex: Vo2MaxSex
): Vo2MaxFitnessAge | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const points = typicalPoints(sex);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  if (value >= first.value) {
    return {
      age: VO2_MAX_NORM_MIN_AGE,
      limit: value > first.value ? 'younger' : null,
    };
  }
  if (value <= last.value) {
    return {
      age: VO2_MAX_NORM_MAX_AGE,
      limit: value < last.value ? 'older' : null,
    };
  }
  for (let i = 1; i < points.length; i += 1) {
    const hi = points[i];
    const lo = points[i - 1];
    if (!hi || !lo || value < hi.value) continue;
    const share = (lo.value - value) / (lo.value - hi.value);
    return { age: Math.round(lo.age + share * (hi.age - lo.age)), limit: null };
  }
  return null;
}
