import {
  AddedSugarAlgorithm,
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  type AlgorithmBundle,
} from '@workspace/shared';
import type { UserPreferences } from '../types/preferences';

const enumValue = <T extends string>(
  values: Record<string, T>,
  raw: string | undefined,
  fallback: T
): T => (Object.values(values).includes(raw as T) ? (raw as T) : fallback);

/**
 * The nutrient goal algorithms the account chose (Calculation Settings on the
 * web), with the defaults for anything unset or unknown to this app.
 */
export function nutrientAlgorithmsFromPreferences(
  preferences: UserPreferences | undefined
): AlgorithmBundle {
  return {
    fatBreakdown: enumValue(
      FatBreakdownAlgorithm,
      preferences?.fat_breakdown_algorithm,
      FatBreakdownAlgorithm.AHA_GUIDELINES
    ),
    minerals: enumValue(
      MineralCalculationAlgorithm,
      preferences?.mineral_calculation_algorithm,
      MineralCalculationAlgorithm.RDA_STANDARD
    ),
    vitamins: enumValue(
      VitaminCalculationAlgorithm,
      preferences?.vitamin_calculation_algorithm,
      VitaminCalculationAlgorithm.RDA_STANDARD
    ),
    sugar: enumValue(
      SugarCalculationAlgorithm,
      preferences?.sugar_calculation_algorithm,
      SugarCalculationAlgorithm.WHO_GUIDELINES
    ),
    addedSugar: AddedSugarAlgorithm.WHO_MAXIMUM,
  };
}
