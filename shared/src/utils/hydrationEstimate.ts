/**
 * Fallback estimate for exercise-induced water loss, used to bump a user's
 * daily water goal by their expected sweat loss when `add_exercise_water_to_goal`
 * is enabled (see `goalService.getUserGoalsForRange`).
 *
 * Some sources hand us a real, device-measured value (Garmin's Connect API
 * reports its own `waterEstimated` per activity) and that value always wins.
 * Everything else -- manually logged exercise, workout plans, CSV imports,
 * and integrations that don't report hydration -- has no such number, so the
 * goal adjustment silently did nothing for it. This fills that gap with a
 * simple, widely used approximation: roughly 1 mL of sweat lost per kcal
 * burned during exercise. It intentionally ignores body weight, ambient
 * temperature, and clothing -- a personalized model would need data we don't
 * have -- but it means every logged workout contributes *something* toward
 * hydration instead of only Garmin-synced ones.
 */
export function estimateExerciseWaterLossMl(
  caloriesBurned: number | string | null | undefined,
): number {
  const calories = Number(caloriesBurned);
  if (!Number.isFinite(calories) || calories <= 0) {
    return 0;
  }
  return Math.round(calories);
}
