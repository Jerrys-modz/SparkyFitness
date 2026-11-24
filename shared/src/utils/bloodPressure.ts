/**
 * Blood pressure classification and averaging. The single source for every
 * package: never re-derive categories or home averages elsewhere.
 *
 * Categories follow the AHA/ACC adult thresholds (normal under 120 and 80,
 * elevated 120-129 and under 80, stage 1 130-139 or 80-89, stage 2 140 or 90
 * and over, severe over 180 or over 120). When systolic and diastolic fall in
 * different categories the higher one applies. This is information, never a
 * diagnosis.
 */

export const BLOOD_PRESSURE_CATEGORIES = [
  'normal',
  'elevated',
  'stage1',
  'stage2',
  'severe',
] as const;

export type BloodPressureCategory = (typeof BLOOD_PRESSURE_CATEGORIES)[number];

export interface BloodPressureReading {
  systolic: number;
  diastolic: number;
}

export interface TimedBloodPressureReading extends BloodPressureReading {
  /** Calendar day, YYYY-MM-DD, in the person's timezone. */
  date: string;
  /** Hour of day 0-23 in the person's timezone, for the morning/evening split. */
  hour: number;
}

/** Home averages at or above this indicate hypertension (lower than the office cutoff). */
export const HOME_BLOOD_PRESSURE_THRESHOLD: BloodPressureReading = {
  systolic: 135,
  diastolic: 85,
};

/** A home average needs at least this many distinct days of readings. */
export const HOME_AVERAGE_MIN_DAYS = 5;

const systolicCategory = (value: number): BloodPressureCategory => {
  if (value > 180) return 'severe';
  if (value >= 140) return 'stage2';
  if (value >= 130) return 'stage1';
  if (value >= 120) return 'elevated';
  return 'normal';
};

const diastolicCategory = (value: number): BloodPressureCategory => {
  if (value > 120) return 'severe';
  if (value >= 90) return 'stage2';
  if (value >= 80) return 'stage1';
  return 'normal';
};

export function classifyBloodPressure(
  reading: BloodPressureReading
): BloodPressureCategory {
  const s = BLOOD_PRESSURE_CATEGORIES.indexOf(
    systolicCategory(reading.systolic)
  );
  const d = BLOOD_PRESSURE_CATEGORIES.indexOf(
    diastolicCategory(reading.diastolic)
  );
  return BLOOD_PRESSURE_CATEGORIES[Math.max(s, d)] ?? 'normal';
}

const mean = (values: number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

export interface BloodPressureAverage extends BloodPressureReading {
  count: number;
}

export function averageBloodPressure(
  readings: readonly BloodPressureReading[]
): BloodPressureAverage | null {
  if (readings.length === 0) return null;
  return {
    systolic: Math.round(mean(readings.map((r) => r.systolic))),
    diastolic: Math.round(mean(readings.map((r) => r.diastolic))),
    count: readings.length,
  };
}

export interface BloodPressureSummary {
  overall: BloodPressureAverage | null;
  morning: BloodPressureAverage | null;
  evening: BloodPressureAverage | null;
  highest: BloodPressureReading | null;
  lowest: BloodPressureReading | null;
}

/** Morning is before noon, evening is 17:00 or later; afternoon only counts toward overall. */
export function summarizeBloodPressure(
  readings: readonly TimedBloodPressureReading[]
): BloodPressureSummary {
  if (readings.length === 0) {
    return {
      overall: null,
      morning: null,
      evening: null,
      highest: null,
      lowest: null,
    };
  }
  const byPressure = [...readings].sort(
    (a, b) => a.systolic - b.systolic || a.diastolic - b.diastolic
  );
  const lowest = byPressure[0];
  const highest = byPressure[byPressure.length - 1];
  if (!lowest || !highest) {
    return {
      overall: null,
      morning: null,
      evening: null,
      highest: null,
      lowest: null,
    };
  }
  return {
    overall: averageBloodPressure(readings),
    morning: averageBloodPressure(readings.filter((r) => r.hour < 12)),
    evening: averageBloodPressure(readings.filter((r) => r.hour >= 17)),
    highest: { systolic: highest.systolic, diastolic: highest.diastolic },
    lowest: { systolic: lowest.systolic, diastolic: lowest.diastolic },
  };
}

export interface HomeBloodPressureAverage {
  average: BloodPressureAverage;
  daysUsed: number;
  /** True when the average is at or above 135 or 85. */
  atOrAboveHomeThreshold: boolean;
}

/**
 * Home average in the style of the "722" protocol: drop the first day of
 * readings, then average the rest. Returns null until there are at least
 * HOME_AVERAGE_MIN_DAYS distinct days (counting the dropped first day).
 */
export function homeBloodPressureAverage(
  readings: readonly TimedBloodPressureReading[]
): HomeBloodPressureAverage | null {
  const days = [...new Set(readings.map((r) => r.date))].sort();
  if (days.length < HOME_AVERAGE_MIN_DAYS) return null;
  const used = readings.filter((r) => r.date !== days[0]);
  const average = averageBloodPressure(used);
  if (!average) return null;
  return {
    average,
    daysUsed: days.length - 1,
    atOrAboveHomeThreshold:
      average.systolic >= HOME_BLOOD_PRESSURE_THRESHOLD.systolic ||
      average.diastolic >= HOME_BLOOD_PRESSURE_THRESHOLD.diastolic,
  };
}
