import {
  addDays,
  ageFromDateOfBirth,
  rateVo2Max,
  todayInZone,
  vo2MaxFitnessAge,
  type Vo2MaxFitnessAge,
  type Vo2MaxRating,
  type Vo2MaxSex,
} from '@workspace/shared';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import userRepository from '../models/userRepository.js';
import reportService from './reportService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

export const DEFAULT_VO2_MAX_REVIEW_WINDOW_DAYS = 90;
/** A change smaller than this (ml/kg/min) over the window reads as steady. */
const STEADY_CHANGE = 1;

export interface Vo2MaxReview {
  window: { from: string; to: string; days: number };
  /** One reading per day, oldest first; several sources on a day are averaged. */
  readings: { day: string; value: number }[];
  latest: { day: string; value: number } | null;
  /** Latest minus earliest reading in the window; null with fewer than two days of readings. */
  change: number | null;
  direction: 'up' | 'down' | 'steady' | null;
  age: number | null;
  sex: Vo2MaxSex | null;
  rating: Vo2MaxRating | null;
  fitnessAge: Vo2MaxFitnessAge | null;
  /** The run-based model figure, an estimate and never a measurement. */
  runEstimate: { value: number; runs: number } | null;
}

export interface Vo2MaxReviewInput {
  readings: { entry_date: string; vo2_max: number }[];
  dateOfBirth: string | null;
  gender: unknown;
  runEstimate: { value: number; runs: number } | null;
  today: string;
  windowDays: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The pure part of the review: readings, direction, and the rating for the person's age and sex. */
export function buildVo2MaxReview(input: Vo2MaxReviewInput): Vo2MaxReview {
  const byDay = new Map<string, number[]>();
  for (const row of input.readings) {
    byDay.set(row.entry_date, [
      ...(byDay.get(row.entry_date) ?? []),
      row.vo2_max,
    ]);
  }
  const readings = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({
      day,
      value: round1(values.reduce((sum, v) => sum + v, 0) / values.length),
    }));
  const first = readings[0] ?? null;
  const latest = readings[readings.length - 1] ?? null;
  const change =
    first && latest && readings.length > 1
      ? round1(latest.value - first.value)
      : null;
  const direction =
    change === null
      ? null
      : change > STEADY_CHANGE
        ? 'up'
        : change < -STEADY_CHANGE
          ? 'down'
          : 'steady';
  const age = ageFromDateOfBirth(input.dateOfBirth, input.today);
  const sex: Vo2MaxSex | null =
    input.gender === 'male' || input.gender === 'female' ? input.gender : null;
  return {
    window: {
      from: addDays(input.today, -(input.windowDays - 1)),
      to: input.today,
      days: input.windowDays,
    },
    readings,
    latest,
    change,
    direction,
    age,
    sex,
    rating:
      latest && age !== null && sex ? rateVo2Max(latest.value, age, sex) : null,
    fitnessAge: latest && sex ? vo2MaxFitnessAge(latest.value, sex) : null,
    runEstimate: input.runEstimate,
  };
}

/**
 * Reads the person's VO2 max for the AI assistant: device readings over the
 * window, how they moved, how the latest compares with people of the same age
 * and sex, and the run-based estimate kept apart from the measured figure.
 */
async function getVo2MaxReview(
  userId: string,
  windowDays: number = DEFAULT_VO2_MAX_REVIEW_WINDOW_DAYS
): Promise<Vo2MaxReview> {
  const timezone = await loadUserTimezone(userId);
  const today = todayInZone(timezone);
  const [readings, profile, estimates] = await Promise.all([
    genericHealthRepository.getVo2MaxReadings(
      userId,
      addDays(today, -(windowDays - 1)),
      today
    ),
    userRepository.getUserProfile(userId),
    reportService.getRunningEstimates(userId, userId),
  ]);
  return buildVo2MaxReview({
    readings,
    dateOfBirth: profile?.date_of_birth ?? null,
    gender: profile?.gender,
    runEstimate: estimates.vo2Max
      ? { value: estimates.vo2Max.value, runs: estimates.vo2Max.runs }
      : null,
    today,
    windowDays,
  });
}

export { getVo2MaxReview };
export default { getVo2MaxReview };
