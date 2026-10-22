import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import weightCoachingRepository from '../models/weightCoachingRepository.js';
import bmrService from './bmrService.js';
import goalService from './goalService.js';
import { buildGoalTimelinePayload } from '../utils/goalTimelinePayload.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  COACHING_HISTORY_POINTS,
  COACHING_HISTORY_STEP_DAYS,
  COACHING_WINDOW_DAYS,
  MIN_CALORIE_SAFETY_FLOOR,
  addDays,
  buildWeightCoachingCheckIn,
  calculateAge,
  calculateMinimumMetabolism,
  getRecommendedCalorieSafetyFloor,
  isCoachingCheckInDay,
  resolveCalorieSafetyFloor,
  todayInZone,
  type CoachingCheckInResponse,
  type CoachingIntakeDay,
  type CoachingSettings,
  type CoachingTargets,
  type CoachingWeighIn,
  type UpdateCoachingSettingsBody,
} from '@workspace/shared';

/** Data the oldest history window needs, plus a few days of slack. */
const LOOKBACK_DAYS =
  COACHING_WINDOW_DAYS +
  COACHING_HISTORY_POINTS * COACHING_HISTORY_STEP_DAYS +
  7;

type CoachingConflictCode =
  'goal-managed-by-settings' | 'nothing-to-accept' | 'check-in-changed';

class CoachingConflictError extends Error {
  readonly code: CoachingConflictCode;
  constructor(code: CoachingConflictCode, message: string) {
    super(message);
    this.name = 'CoachingConflictError';
    this.code = code;
  }
}

interface CheckInRow {
  entry_date: string | Date;
  weight: string | number | null;
}

interface NutritionRow {
  date: string;
  calories: string | number | null;
}

type StoredGoals = Record<string, unknown>;

function numberOr(value: unknown, fallback: number): number {
  const n =
    typeof value === 'string' || typeof value === 'number'
      ? Number(value)
      : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function goalTargets(goals: StoredGoals): CoachingTargets {
  return {
    calories: numberOr(goals.calories, 0),
    protein: numberOr(goals.protein, 0),
    carbs: numberOr(goals.carbs, 0),
    fat: numberOr(goals.fat, 0),
  };
}

function hasMacroPercentages(goals: StoredGoals): boolean {
  const isSet = (value: unknown) => value !== null && value !== undefined;
  return (
    isSet(goals.protein_percentage) &&
    isSet(goals.carbs_percentage) &&
    isSet(goals.fat_percentage)
  );
}

/** One weigh-in per day: the most recently updated reading (rows arrive newest first). */
function toWeighIns(rows: readonly CheckInRow[]): CoachingWeighIn[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const weight = row.weight === null ? NaN : Number(row.weight);
    const day = String(row.entry_date).slice(0, 10);
    if (Number.isFinite(weight) && weight > 0 && !byDay.has(day)) {
      byDay.set(day, weight);
    }
  }
  return [...byDay.entries()].map(([date, weightKg]) => ({ date, weightKg }));
}

function toIntakeDays(rows: readonly NutritionRow[]): CoachingIntakeDay[] {
  return rows.map((row) => ({
    date: String(row.date).slice(0, 10),
    calories: numberOr(row.calories, 0),
  }));
}

async function getCoachingCheckIn(
  authenticatedUserId: string,
  targetUserId: string
): Promise<CoachingCheckInResponse> {
  const tz = await loadUserTimezone(targetUserId);
  const today = todayInZone(tz);
  const from = addDays(today, -LOOKBACK_DAYS);
  const [
    settings,
    profile,
    preferences,
    checkIns,
    nutrition,
    latest,
    storedGoals,
    effectiveGoals,
  ] = await Promise.all([
    weightCoachingRepository.getCoachingSettings(
      targetUserId,
      authenticatedUserId
    ),
    userRepository.getUserProfile(targetUserId),
    preferenceRepository.getUserPreferences(targetUserId),
    measurementRepository.getCheckInMeasurementsByDateRange(
      targetUserId,
      from,
      today
    ),
    reportRepository.getNutritionData(targetUserId, from, today, []),
    measurementRepository.getLatestMeasurement(targetUserId),
    goalService.getUserGoals(targetUserId, today) as Promise<StoredGoals>,
    goalService.getUserGoals(
      targetUserId,
      today,
      undefined,
      true
    ) as Promise<StoredGoals>,
  ]);

  const gender = profile?.gender === 'female' ? 'female' : 'male';
  const weightKg = numberOr(latest?.weight, 70);
  const rmr = calculateMinimumMetabolism(
    weightKg,
    numberOr(latest?.height, 170),
    calculateAge(profile?.date_of_birth ?? '', tz) ?? 30,
    gender,
    latest?.body_fat_percentage ? Number(latest.body_fat_percentage) : null,
    preferences?.bmr_algorithm || 'Mifflin-St Jeor',
    bmrService.calculateBmr
  );
  // A proposal never goes below the absolute minimum, even where the person has
  // switched the adaptive-goal floor off.
  const safetyFloorKcal = Math.max(
    MIN_CALORIE_SAFETY_FLOOR,
    resolveCalorieSafetyFloor(
      preferences?.calorie_safety_floor_mode,
      preferences?.calorie_safety_floor_value,
      getRecommendedCalorieSafetyFloor(rmr, gender)
    ) ?? 0
  );

  const checkIn = buildWeightCoachingCheckIn({
    today,
    weighIns: toWeighIns((checkIns || []) as CheckInRow[]),
    intake: toIntakeDays((nutrition || []) as NutritionRow[]),
    current: goalTargets(effectiveGoals),
    goal: {
      direction: settings.direction,
      rateKgPerWeek: settings.rateKgPerWeek,
    },
    safetyFloorKcal,
    macroBudgetOffsetKcal: hasMacroPercentages(storedGoals)
      ? 2 * numberOr(storedGoals.dietary_fiber, 0)
      : 0,
  });

  // Calorie Settings that derive the calorie target would overwrite a stored
  // goal on the next read, so accepting here would not stick.
  const goalManagedBySettings =
    preferences?.calorie_goal_adjustment_mode === 'adaptive' ||
    preferences?.goal_mode_calculation_method === 'adaptive' ||
    (preferences?.goal_mode ?? 'maintain') !== 'maintain';

  return {
    ...checkIn,
    settings,
    goalManagedBySettings,
    checkInDue: isCoachingCheckInDay(today, settings.checkInWeekday),
  };
}

/**
 * Writes the proposal the person was shown through the goals timeline, from
 * today forward. The check-in is recomputed first; if it no longer matches what
 * they saw, nothing is written.
 */
async function acceptCoachingCheckIn(
  userId: string,
  shownCalories: number
): Promise<CoachingTargets> {
  const checkIn = await getCoachingCheckIn(userId, userId);
  if (checkIn.goalManagedBySettings) {
    throw new CoachingConflictError(
      'goal-managed-by-settings',
      'Your calorie target is set by Calorie Settings, so a coaching change would be overwritten.'
    );
  }
  if (!checkIn.actionable || !checkIn.suggested) {
    throw new CoachingConflictError(
      'nothing-to-accept',
      'There is no target change to accept.'
    );
  }
  if (checkIn.suggested.calories !== shownCalories) {
    throw new CoachingConflictError(
      'check-in-changed',
      'Your data changed since this suggestion was made. Review the new one.'
    );
  }

  const stored = (await goalService.getUserGoals(
    userId,
    checkIn.asOf
  )) as StoredGoals;
  const { suggested } = checkIn;
  // Goals saved as percentages keep them (the split stays exactly as set) unless
  // the protein floor had to move it, in which case the grams are saved instead.
  const keepPercentages =
    hasMacroPercentages(stored) && !checkIn.proteinFloorApplied;
  const payload = buildGoalTimelinePayload(
    checkIn.asOf,
    stored,
    keepPercentages
      ? { p_calories: suggested.calories }
      : {
          p_calories: suggested.calories,
          p_protein: suggested.protein,
          p_carbs: suggested.carbs,
          p_fat: suggested.fat,
        },
    { keepMacroPercentages: keepPercentages }
  );
  await goalService.manageGoalTimeline(userId, payload);
  log(
    'info',
    `Coaching check-in accepted for user ${userId}: ${checkIn.current.calories} -> ${suggested.calories} kcal`
  );
  return suggested;
}

async function updateCoachingSettings(
  userId: string,
  patch: UpdateCoachingSettingsBody
): Promise<CoachingSettings> {
  return weightCoachingRepository.updateCoachingSettings(userId, patch);
}

export {
  CoachingConflictError,
  getCoachingCheckIn,
  acceptCoachingCheckIn,
  updateCoachingSettings,
};
export default {
  getCoachingCheckIn,
  acceptCoachingCheckIn,
  updateCoachingSettings,
};
