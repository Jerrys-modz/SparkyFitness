import {
  addDays,
  buildGoalWeightPlan,
  compareDays,
  computeDailyWeightTrend,
  todayInZone,
} from '@workspace/shared';
import type { GoalWeightPlanResponse } from '@workspace/shared';
import onboardingRepository from '../models/onboardingRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import reportRepository from '../models/reportRepository.js';
import { getCalorieTargetReview } from './calorieTargetReviewService.js';
import { getEffectiveCalorieSafetyFloor } from './calorieSafetyFloorService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/** Weigh-ins read for the trend: enough to cover a planned path's start. */
const TREND_LOOKBACK_DAYS = 365;

/**
 * Where the goal weight and its target date stand against the saved calorie
 * goal. The pace the calorie goal gives is the same figure the calorie target
 * review uses (saved goal against the adaptive maintenance estimate), so it
 * covers every goal mode (Cut, High cut, weekly, manual). Read-only: applying a
 * pace is an ordinary preferences update made by the client.
 */
async function getGoalWeightPlan(
  userId: string
): Promise<GoalWeightPlanResponse> {
  const timezone = await loadUserTimezone(userId);
  const today = todayInZone(timezone);
  const [goal, preferences] = await Promise.all([
    onboardingRepository.getGoalWeight(userId),
    preferenceRepository.getUserPreferences(userId) as Promise<
      | {
          goal_mode?: string | null;
          goal_mode_weekly_change_kg?: number | null;
        }
      | undefined
    >,
  ]);
  const goalMode = preferences?.goal_mode ?? null;
  const weeklyChangeKg =
    preferences?.goal_mode_weekly_change_kg === null ||
    preferences?.goal_mode_weekly_change_kg === undefined
      ? null
      : Number(preferences.goal_mode_weekly_change_kg);

  const empty: GoalWeightPlanResponse = {
    goalKg: goal.targetWeightKg,
    targetDate: goal.targetDate,
    setOn: goal.setOn,
    currentKg: null,
    goalMode,
    weeklyChangeKg,
    plan: null,
  };
  if (goal.targetWeightKg === null) return empty;

  const readings = await reportRepository.getBodyWeightReadings(
    userId,
    addDays(today, -TREND_LOOKBACK_DAYS),
    today
  );
  const daily = computeDailyWeightTrend(
    readings
      .filter((r) => compareDays(r.date, today) <= 0)
      .map((r) => ({ date: r.date, weight: r.weightKg }))
  );
  const last = daily[daily.length - 1];
  if (!last) return empty;
  const currentKg = Math.round(last.trend * 100) / 100;
  if (!goal.targetDate) return { ...empty, currentKg };

  // The trend on the day the goal was set; before the first weigh-in there is none.
  const startPoint = goal.setOn
    ? [...daily].reverse().find((p) => compareDays(p.date, goal.setOn!) <= 0)
    : undefined;

  const [review, safetyFloor] = await Promise.all([
    getCalorieTargetReview(userId),
    getEffectiveCalorieSafetyFloor(userId, today),
  ]);
  const maintenanceKcal =
    Number.isFinite(review.maintenanceKcal) && review.maintenanceKcal > 0
      ? review.maintenanceKcal
      : null;
  // The floor the calorie engine really holds the target at. With the floor
  // turned off nothing is held, so the standard floor is only advice: the pace
  // is still warned about but stays reachable.
  const floorEnforced = safetyFloor.enforcedKcal !== null;

  const plan = buildGoalWeightPlan({
    today,
    targetDate: goal.targetDate,
    goalKg: goal.targetWeightKg,
    currentKg,
    startKg: startPoint ? startPoint.trend : null,
    setOn: startPoint ? goal.setOn : null,
    settingKgPerWeek: maintenanceKcal === null ? null : review.impliedKgPerWeek,
    maintenanceKcal,
    floorKcal: safetyFloor.enforcedKcal ?? safetyFloor.standardKcal,
    floorEnforced,
  });
  return { ...empty, currentKg, plan };
}

export { getGoalWeightPlan };
export default { getGoalWeightPlan };
