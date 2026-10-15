import {
  buildNamedFoodPortion,
  FOOD_VARIANT_NUTRIENT_FIELDS,
  parseNamedFoodPortion,
  type FoodPortionDefinition,
  type FoodPortionSource,
} from '@workspace/shared';
import type { FoodVariantDetail } from '../types/foods';
import {
  createFoodVariant,
  deleteFoodVariant,
  fetchFoodVariants,
  updateFoodVariant,
} from '../services/api/foodsApi';

export interface EditableFoodPortion extends FoodPortionDefinition {
  id?: string;
  preserveNutrition?: boolean;
}

export function isCalculatedFoodPortion(
  source: FoodPortionSource,
  variant: FoodPortionSource
): boolean {
  const definition = parseNamedFoodPortion(variant.serving_unit);
  const expected = definition && buildNamedFoodPortion(source, definition);
  if (!expected || variant.serving_size !== 1) return false;
  const equalAmount = (left: number, right: number) =>
    Math.abs(left - right) <=
    Math.max(1, Math.abs(left), Math.abs(right)) * 0.00001;
  if (
    ![...FOOD_VARIANT_NUTRIENT_FIELDS, 'water_ml'].every((field) =>
      equalAmount(
        Number(expected[field as keyof typeof expected] ?? 0),
        Number(variant[field as keyof FoodPortionSource] ?? 0)
      )
    )
  )
    return false;
  const customNames = new Set([
    ...Object.keys(expected.custom_nutrients ?? {}),
    ...Object.keys(variant.custom_nutrients ?? {}),
  ]);
  if (
    [...customNames].some(
      (name) =>
        !equalAmount(
          Number(expected.custom_nutrients?.[name] ?? 0),
          Number(variant.custom_nutrients?.[name] ?? 0)
        )
    )
  )
    return false;
  return (
    (expected.abv_percent ?? null) === (variant.abv_percent ?? null) &&
    (expected.glycemic_index ?? null) === (variant.glycemic_index ?? null)
  );
}

/** Read before each attempt: a successful POST with a lost response must not create duplicates on retry. */

export async function saveNamedFoodPortions(
  foodId: string,
  source: FoodPortionSource,
  portions: readonly EditableFoodPortion[],
  removedIds: readonly string[] = []
): Promise<FoodVariantDetail[]> {
  const desired = portions
    .filter((portion) => !portion.preserveNutrition)
    .map((portion) => {
      const variant = buildNamedFoodPortion(source, portion);
      if (!variant) throw new Error('Invalid food portion reference');
      return {
        id: portion.id,
        payload: {
          ...variant,
          glycemic_index: variant.glycemic_index ?? undefined,
          abv_percent: variant.abv_percent ?? undefined,
          food_id: foodId,
        },
      };
    });
  const existing = await fetchFoodVariants(foodId);
  for (const row of desired) {
    const match =
      existing.find((variant) => variant.id === row.id) ??
      existing.find(
        (variant) =>
          variant.serving_size === 1 &&
          variant.serving_unit === row.payload.serving_unit
      );
    if (match) {
      await updateFoodVariant(match.id, {
        ...row.payload,
        source: match.source ?? row.payload.source,
        ai_confidence:
          match.ai_confidence === undefined
            ? row.payload.ai_confidence
            : match.ai_confidence,
      });
    } else {
      await createFoodVariant(row.payload);
    }
  }
  for (const id of removedIds) {
    const match = existing.find((variant) => variant.id === id);
    if (match && parseNamedFoodPortion(match.serving_unit))
      await deleteFoodVariant(id);
  }
  const confirmed = await fetchFoodVariants(foodId);
  if (
    desired.some(
      (row) =>
        !confirmed.some(
          (variant) =>
            variant.serving_unit === row.payload.serving_unit &&
            variant.serving_size === 1
        )
    ) ||
    removedIds.some((id) => confirmed.some((row) => row.id === id))
  ) {
    throw new Error('Food portions could not be confirmed');
  }
  return confirmed;
}
