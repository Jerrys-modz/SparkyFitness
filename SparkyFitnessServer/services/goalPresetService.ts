import goalPresetRepository from '../models/goalPresetRepository.js';
import { log } from '../config/logging.js';
import { hasMacroPercentages, todayInZone } from '@workspace/shared';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  bodyMeasurementsOnOrBefore,
  macroGramsToStore,
  readMacroPerKgInput,
  storedMacroPerKgFields,
} from '../utils/macroPerKgGoal.js';
// Convert water_goal_ml to the correct repository field name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWaterGoalMlToDb(presetData: any) {
  const { water_goal_ml, custom_meal_percentages, ...rest } = presetData;
  return {
    ...rest,
    water_goal: water_goal_ml,
    custom_meal_percentages: custom_meal_percentages || {},
  };
}
// Convert water_goal repository field name to water_goal_ml
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToWaterGoalMl(presetData: any) {
  const { water_goal, ...rest } = presetData;
  return {
    ...rest,
    ...storedMacroPerKgFields(presetData),
    water_goal_ml: water_goal,
  };
}
// Works out the grams saved with a preset: from its percentages, and for
// protein or fat set per kg from the person's latest weight (the fallback for
// a day with no weight logged, and what older clients display). The per-kg
// fields are validated here; `supplied` is false for an older client that
// sent none of them.
async function applyPresetMacros(
  userId: string,
  presetData: Record<string, unknown>
) {
  const perKg = readMacroPerKgInput(presetData);
  delete presetData.protein_per_kg;
  delete presetData.fat_per_kg;
  delete presetData.macro_per_kg_basis;
  const usesPerKg =
    perKg.fields.protein_per_kg !== null || perKg.fields.fat_per_kg !== null;
  const hasCalories =
    presetData.calories !== null && presetData.calories !== undefined;
  const goal = {
    calories: Number(presetData.calories) || 0,
    dietaryFiber: presetData.dietary_fiber as number | null | undefined,
    protein: presetData.protein as number | null | undefined,
    carbs: presetData.carbs as number | null | undefined,
    fat: presetData.fat as number | null | undefined,
    proteinPercentage: presetData.protein_percentage as number | null,
    carbsPercentage: presetData.carbs_percentage as number | null,
    fatPercentage: presetData.fat_percentage as number | null,
  };
  // Without calories the percentage maths has nothing to share out.
  if ((hasCalories && hasMacroPercentages(goal)) || usesPerKg) {
    const measurements = usesPerKg
      ? await bodyMeasurementsOnOrBefore(
          userId,
          todayInZone(await loadUserTimezone(userId))
        )
      : { weightKg: null, bodyFatPercentage: null };
    const grams = macroGramsToStore(
      hasCalories ? goal : { ...goal, proteinPercentage: null },
      perKg.fields,
      measurements
    );
    presetData.protein = grams.protein;
    presetData.carbs = grams.carbs;
    presetData.fat = grams.fat;
  }
  return perKg;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createGoalPreset(userId: any, presetData: any) {
  // Outside the try, so a bad per-kg value answers 400, not "Failed to ...".
  const perKg = await applyPresetMacros(userId, presetData);
  try {
    const dbPresetData = mapWaterGoalMlToDb({
      ...presetData,
      ...perKg.fields,
      user_id: userId,
    });
    const newPreset = await goalPresetRepository.createGoalPreset(dbPresetData);
    return newPreset;
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.code === '23505') {
      throw new Error('A goal preset with this name already exists.', {
        cause: error,
      });
    }
    log('error', `Error creating goal preset for user ${userId}:`, error);
    throw new Error('Failed to create goal preset.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGoalPresets(userId: any) {
  try {
    const presets = await goalPresetRepository.getGoalPresetsByUserId(userId);
    return presets.map(mapDbToWaterGoalMl);
  } catch (error) {
    log('error', `Error fetching goal presets for user ${userId}:`, error);
    throw new Error('Failed to fetch goal presets.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGoalPreset(presetId: any, userId: any) {
  try {
    const preset = await goalPresetRepository.getGoalPresetById(
      presetId,
      userId
    );
    return preset ? mapDbToWaterGoalMl(preset) : null;
  } catch (error) {
    log(
      'error',
      `Error fetching goal preset ${presetId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to fetch goal preset.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateGoalPreset(presetId: any, userId: any, presetData: any) {
  if (
    presetData.protein_per_kg === undefined &&
    presetData.fat_per_kg === undefined
  ) {
    // An older client: keep the stored per-kg setting, and work the grams out
    // from it, so its stale gram fields do not become the fallback.
    const stored = await goalPresetRepository.getGoalPresetById(
      presetId,
      userId
    );
    if (stored && presetData.macro_per_kg_basis === undefined) {
      Object.assign(presetData, storedMacroPerKgFields(stored));
    }
  }
  const perKg = await applyPresetMacros(userId, presetData);
  try {
    const dbPresetData = mapWaterGoalMlToDb({
      ...presetData,
      ...perKg.fields,
      macro_per_kg_supplied: true,
      user_id: userId,
    });
    const updatedPreset = await goalPresetRepository.updateGoalPreset(
      presetId,
      dbPresetData
    );
    return updatedPreset;
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.code === '23505') {
      throw new Error('A goal preset with this name already exists.', {
        cause: error,
      });
    }
    log(
      'error',
      `Error updating goal preset ${presetId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to update goal preset.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteGoalPreset(presetId: any, userId: any) {
  try {
    const deletedPreset = await goalPresetRepository.deleteGoalPreset(
      presetId,
      userId
    );
    return deletedPreset;
  } catch (error) {
    log(
      'error',
      `Error deleting goal preset ${presetId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to delete goal preset.', { cause: error });
  }
}
export { createGoalPreset };
export { getGoalPresets };
export { getGoalPreset };
export { updateGoalPreset };
export { deleteGoalPreset };
export default {
  createGoalPreset,
  getGoalPresets,
  getGoalPreset,
  updateGoalPreset,
  deleteGoalPreset,
};
