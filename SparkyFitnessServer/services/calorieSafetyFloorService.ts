import {
  getClinicalCalorieMinimum,
  getRecommendedCalorieSafetyFloor,
  isUsableMeasuredBmr,
  resolveCalorieSafetyFloor,
  CALORIE_CALCULATION_CONSTANTS,
} from '@workspace/shared';
import measurementRepository from '../models/measurementRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import bmrService from './bmrService.js';
import { ageOnDay } from '../utils/dateHelpers.js';
import { log } from '../config/logging.js';

export interface SafetyFloorPreferences {
  calorie_safety_floor_mode?: string | null;
  calorie_safety_floor_value?: number | null;
  bmr_algorithm?: string | null;
  use_external_bmr?: boolean | null;
}

export interface SafetyFloorProfile {
  gender?: string | null;
  date_of_birth?: string | Date | null;
}

export interface SafetyFloorMeasurements {
  entry_date?: string | Date | null;
  weight?: number | string | null;
  height?: number | string | null;
  body_fat_percentage?: number | string | null;
  bmr?: number | string | null;
}

export interface EffectiveCalorieSafetyFloor {
  /** The floor the calorie engine holds the target at; null when the person turned it off. */
  enforcedKcal: number | null;
  /** The standard floor (higher of RMR and the clinical minimum), the advice when none is enforced. */
  standardKcal: number;
  mode: 'standard' | 'custom' | 'disabled';
}

const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
};

const dayOf = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
};

/**
 * The calorie safety floor as the engine applies it (`goalService`,
 * `calorieBalanceService`): `calorie_safety_floor_mode` decides. Standard is the
 * higher of the resting metabolic rate and the clinical minimum (1,500 men,
 * 1,200 women), custom is the person's value, and disabled means no floor.
 * The RMR is worked out the way the engine does: the chosen BMR formula on the
 * latest weight, height and body fat, or a measured BMR recorded on `day` when
 * the person uses one. Without a usable RMR only the clinical minimum remains.
 * Pure; `getEffectiveCalorieSafetyFloor` loads the inputs.
 */
export function resolveEffectiveCalorieSafetyFloor(
  preferences: SafetyFloorPreferences | null | undefined,
  profile: SafetyFloorProfile | null | undefined,
  measurements: SafetyFloorMeasurements | null | undefined,
  day: string
): EffectiveCalorieSafetyFloor {
  const gender =
    profile?.gender?.toLowerCase() === 'female' ? 'female' : 'male';
  let rmr = 0;
  if (profile && preferences) {
    try {
      rmr = bmrService.calculateBmr(
        preferences.bmr_algorithm || 'Mifflin-St Jeor',
        toNumber(measurements?.weight) ||
          CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG,
        toNumber(measurements?.height) ||
          CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM,
        ageOnDay(profile.date_of_birth, day) ?? 30,
        gender,
        toNumber(measurements?.body_fat_percentage) ?? undefined
      );
    } catch (error: unknown) {
      log(
        'warn',
        `calorieSafetyFloorService: BMR calc failed: ${(error as Error).message}`
      );
    }
    // A measured BMR only counts on the day it was recorded.
    if (
      preferences.use_external_bmr &&
      dayOf(measurements?.entry_date) === day &&
      isUsableMeasuredBmr(measurements?.bmr, rmr)
    ) {
      rmr = toNumber(measurements?.bmr) as number;
    }
  }
  const standardKcal =
    rmr > 0
      ? getRecommendedCalorieSafetyFloor(rmr, gender)
      : getClinicalCalorieMinimum(gender);
  const resolved = resolveCalorieSafetyFloor(
    preferences?.calorie_safety_floor_mode,
    preferences?.calorie_safety_floor_value,
    standardKcal
  );
  const mode =
    preferences?.calorie_safety_floor_mode === 'disabled'
      ? 'disabled'
      : resolved !== null && resolved !== standardKcal
        ? 'custom'
        : preferences?.calorie_safety_floor_mode === 'custom' &&
            resolved === standardKcal
          ? 'custom'
          : 'standard';
  return {
    enforcedKcal: resolved === null ? null : Math.round(resolved),
    standardKcal: Math.round(standardKcal),
    mode,
  };
}

/** Loads what `resolveEffectiveCalorieSafetyFloor` needs for `userId` on `day`. */
async function getEffectiveCalorieSafetyFloor(
  userId: string,
  day: string
): Promise<EffectiveCalorieSafetyFloor> {
  const [preferences, profile, measurements] = await Promise.all([
    preferenceRepository.getUserPreferences(userId) as Promise<
      SafetyFloorPreferences | undefined
    >,
    userRepository.getUserProfile(userId) as Promise<
      SafetyFloorProfile | undefined
    >,
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
      userId,
      day
    ) as Promise<SafetyFloorMeasurements | undefined>,
  ]);
  return resolveEffectiveCalorieSafetyFloor(
    preferences,
    profile,
    measurements,
    day
  );
}

export { getEffectiveCalorieSafetyFloor };
export default { getEffectiveCalorieSafetyFloor };
