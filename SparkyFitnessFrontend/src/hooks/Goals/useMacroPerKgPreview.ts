import {
  computeMacroTargets,
  type MacroTargets,
  type MacroWeightBasis,
} from '@workspace/shared';
import { useLatestCheckInMeasurements } from '@/hooks/CheckIn/useCheckIn';

/** The goal fields the per-kg preview reads. */
export interface MacroPerKgGoal {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber?: number | null;
  protein_percentage: number | null;
  carbs_percentage: number | null;
  fat_percentage: number | null;
  protein_per_kg?: number | null;
  fat_per_kg?: number | null;
  macro_per_kg_basis?: MacroWeightBasis;
}

export type MacroPerKgUpdate = Pick<
  MacroPerKgGoal,
  'protein_per_kg' | 'fat_per_kg' | 'macro_per_kg_basis'
>;

const positiveOrNull = (value: unknown): number | null => {
  const num = Number(value);
  return value !== null && value !== undefined && num > 0 ? num : null;
};

/**
 * The day's macro grams for a goal, using the latest weight on or before
 * `date`, exactly as the server works them out. `perKg` is null when no
 * macro is set per kg.
 */
export function useMacroPerKgPreview(
  goal: MacroPerKgGoal,
  macroInputType: 'grams' | 'percentages',
  date: string
): MacroTargets {
  const { data: latest } = useLatestCheckInMeasurements(date);
  return computeMacroTargets({
    calories: goal.calories,
    dietaryFiber: goal.dietary_fiber,
    protein: goal.protein,
    carbs: goal.carbs,
    fat: goal.fat,
    proteinPercentage:
      macroInputType === 'percentages' ? goal.protein_percentage : null,
    carbsPercentage:
      macroInputType === 'percentages' ? goal.carbs_percentage : null,
    fatPercentage:
      macroInputType === 'percentages' ? goal.fat_percentage : null,
    proteinPerKg: goal.protein_per_kg,
    fatPerKg: goal.fat_per_kg,
    basis: goal.macro_per_kg_basis,
    weightKg: positiveOrNull(latest?.weight),
    bodyFatPercentage: positiveOrNull(latest?.body_fat_percentage),
  });
}
