import {
  applyDietPhaseToRules,
  withCalorieRuleDefaults,
} from '@workspace/shared';
import type { DietPhaseLike } from '@workspace/shared';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import type { CalorieRuleHistoryRow } from '../models/calorieRuleHistoryRepository.js';
import { loadDietPhasesForCalories } from './dietPhaseService.js';

/**
 * The calorie settings in force on `day`: the latest history row on or before
 * it, else null (no change recorded before that day, so the current settings
 * apply). `history` may be in any order.
 */
export function calorieRulesOnDay(
  history: readonly CalorieRuleHistoryRow[],
  day: string
): CalorieRuleHistoryRow | null {
  let found: CalorieRuleHistoryRow | null = null;
  for (const row of history) {
    if (row.effective_date === '-infinity') {
      found ??= row;
    } else if (
      row.effective_date <= day &&
      (!found ||
        found.effective_date === '-infinity' ||
        row.effective_date > found.effective_date)
    ) {
      found = row;
    }
  }
  return found;
}

/**
 * `preferences` with the calorie settings replaced by those in force on `day`,
 * and an unset one by its default: the same values the Diary is shown. When a
 * diet phase covers `day`, its Goal Mode and weekly rate replace the recorded
 * ones; every other setting still comes from the history. With no phases the
 * result is exactly the recorded settings.
 */
export function preferencesOnDay<T extends object>(
  preferences: T,
  history: readonly CalorieRuleHistoryRow[],
  day: string,
  phases: readonly DietPhaseLike[] = []
): T {
  return {
    ...preferences,
    ...applyDietPhaseToRules(
      withCalorieRuleDefaults(calorieRulesOnDay(history, day) ?? preferences),
      phases,
      day
    ),
  };
}

/**
 * Loads the history for a range and returns a lookup of each day's
 * preferences, so a past day keeps the calorie target it was logged against
 * (#1795), with the person's diet phases applied. Null preferences stay null.
 */
export async function loadPreferencesByDay<T extends object>(
  userId: string,
  preferences: T | null | undefined,
  startDate: string,
  endDate: string
): Promise<(day: string) => T | null> {
  if (!preferences) return () => null;
  const timeline = await loadCalorieRuleTimeline(userId, startDate, endDate);
  return (day) => preferencesOnTimelineDay(preferences, timeline, day);
}

/** The recorded calorie settings of a range and the diet phases over them. */
export interface CalorieRuleTimeline {
  history: CalorieRuleHistoryRow[];
  phases: DietPhaseLike[];
}

/** Loads what `preferencesOnTimelineDay` needs for the days `startDate` to `endDate`. */
export async function loadCalorieRuleTimeline(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CalorieRuleTimeline> {
  const [history, phases] = await Promise.all([
    calorieRuleHistoryRepository.getCalorieRuleHistory(
      userId,
      startDate,
      endDate
    ),
    loadDietPhasesForCalories(userId),
  ]);
  return { history, phases };
}

/** `preferencesOnDay` over a loaded timeline. */
export function preferencesOnTimelineDay<T extends object>(
  preferences: T,
  timeline: CalorieRuleTimeline,
  day: string
): T {
  return preferencesOnDay(preferences, timeline.history, day, timeline.phases);
}

export default {
  loadCalorieRuleTimeline,
  preferencesOnTimelineDay,
  calorieRulesOnDay,
  preferencesOnDay,
  loadPreferencesByDay,
};
