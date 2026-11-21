import { DEFAULT_GOALS } from '@/constants/goals';
import { ExpandedGoals } from '@/types/goals';
import {
  buildOnboardingGoalTargets,
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
  type CalorieSafetyFloorMode,
} from '@workspace/shared';
import { EnergyUnit } from '@/contexts/PreferencesContext';
import { OnboardingData } from '@/types/onboarding';

export const createInitialPlan = (
  formData: OnboardingData,
  localEnergyUnit: 'kcal' | 'kJ',
  localSelectedDiet: string,
  customPercentages: { carbs: number; protein: number; fat: number },
  localFatBreakdownAlgorithm: FatBreakdownAlgorithm,
  localMineralAlgorithm: MineralCalculationAlgorithm,
  localVitaminAlgorithm: VitaminCalculationAlgorithm,
  localSugarAlgorithm: SugarCalculationAlgorithm,
  convertEnergy: (
    value: number,
    fromUnit: EnergyUnit,
    toUnit: EnergyUnit
  ) => number,
  safetyFloor: {
    calorieSafetyFloorMode: CalorieSafetyFloorMode;
    calorieSafetyFloorValue: number;
  }
): ExpandedGoals | null => {
  // formData is already in Metric (kg/cm) from UnitInput
  const targets = buildOnboardingGoalTargets(
    formData,
    localSelectedDiet,
    customPercentages,
    {
      fatBreakdown: localFatBreakdownAlgorithm,
      minerals: localMineralAlgorithm,
      vitamins: localVitaminAlgorithm,
      sugar: localSugarAlgorithm,
    },
    safetyFloor
  );
  if (!targets) return null;

  return {
    ...DEFAULT_GOALS,
    ...targets.goals,
    calories: Math.round(
      convertEnergy(targets.goals.calories, 'kcal', localEnergyUnit)
    ),
    protein_percentage: null,
    carbs_percentage: null,
    fat_percentage: null,
  };
};
