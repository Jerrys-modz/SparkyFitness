/** Goal columns the timeline payload carries as `p_<column>`, in storage order. */
const GOAL_PAYLOAD_COLUMNS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'water_goal_ml',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'caffeine_mg',
  'alcohol_g',
  'target_exercise_calories_burned',
  'target_exercise_duration_minutes',
  'target_steps',
  'breakfast_percentage',
  'lunch_percentage',
  'dinner_percentage',
  'snacks_percentage',
] as const;
const MACRO_PERCENTAGE_COLUMNS = [
  'protein_percentage',
  'carbs_percentage',
  'fat_percentage',
] as const;

export type GoalTimelinePayload = Record<string, unknown>;

/**
 * Timeline payload that re-saves `existing` unchanged apart from `overrides`.
 * `manageGoalTimeline` zeroes or clears every field it is not given, so a caller
 * changing a few goals must carry the rest forward. Stored macro percentages make
 * it recompute the gram values, so pass `keepMacroPercentages: false` whenever the
 * overrides set the macro grams.
 */
export function buildGoalTimelinePayload(
  startDate: string,
  existing: Record<string, unknown>,
  overrides: GoalTimelinePayload = {},
  { keepMacroPercentages = true }: { keepMacroPercentages?: boolean } = {}
): GoalTimelinePayload {
  const payload: GoalTimelinePayload = {
    p_start_date: startDate,
    p_cascade: true,
    custom_meal_percentages: existing.custom_meal_percentages,
    custom_nutrients: existing.custom_nutrients,
  };
  for (const column of GOAL_PAYLOAD_COLUMNS) {
    payload[`p_${column}`] = existing[column];
  }
  if (keepMacroPercentages) {
    for (const column of MACRO_PERCENTAGE_COLUMNS) {
      payload[`p_${column}`] = existing[column];
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) payload[key] = value;
  }
  return payload;
}
