/**
 * The water from food to show on the watch's Water page. Null unless food water
 * counts toward intake: the watch shows the line only when it gets a number,
 * so people who have not opted in never see it.
 */
export function watchWaterFromFoodMl(
  foodWaterCounts: boolean | null | undefined,
  fromFoodMl: number | null | undefined
): number | null {
  if (!foodWaterCounts) return null;
  return fromFoodMl != null && Number.isFinite(fromFoodMl) && fromFoodMl > 0
    ? fromFoodMl
    : 0;
}
