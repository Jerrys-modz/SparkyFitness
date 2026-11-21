import i18n from 'i18next';
import { getDietMacroSplit } from '@workspace/shared';

const split = (id: string) => {
  const { carbs, protein, fat } = getDietMacroSplit(id);
  return {
    carbsPercentage: carbs,
    proteinPercentage: protein,
    fatPercentage: fat,
  };
};
export interface DietTemplate {
  id: string;
  name: string;
  description: string;
  carbsPercentage: number;
  proteinPercentage: number;
  fatPercentage: number;
}

export const DIET_TEMPLATES: DietTemplate[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    get description() {
      return i18n.t(
        'dietTemplates.wellRoundedNutritionForGeneral',
        'Well-rounded nutrition for general health'
      );
    },
    ...split('balanced'),
  },
  {
    id: 'mediterranean',
    name: 'Mediterranean',
    get description() {
      return i18n.t(
        'dietTemplates.heartHealthyWithHealthyFats',
        'Heart-healthy with healthy fats'
      );
    },
    ...split('mediterranean'),
  },
  {
    id: 'dash',
    name: 'DASH',
    get description() {
      return i18n.t(
        'dietTemplates.dietaryApproachesToStopHypertension',
        'Dietary Approaches to Stop Hypertension'
      );
    },
    ...split('dash'),
  },
  {
    id: 'atkins',
    name: 'Atkins',
    get description() {
      return i18n.t(
        'dietTemplates.veryLowCarbHighFat',
        'Very low carb, high fat'
      );
    },
    ...split('atkins'),
  },
  {
    id: 'low_fat',
    name: 'Low Fat',
    get description() {
      return i18n.t(
        'dietTemplates.highCarbMinimalFat',
        'High carb, minimal fat'
      );
    },
    ...split('low_fat'),
  },
  {
    id: 'low_carb',
    name: 'Low Carb / Keto',
    get description() {
      return i18n.t('dietTemplates.ketogenicStyleDiet', 'Ketogenic-style diet');
    },
    ...split('low_carb'),
  },
  {
    id: 'custom',
    name: 'Custom',
    get description() {
      return i18n.t(
        'dietTemplates.setYourOwnPercentages',
        'Set your own percentages'
      );
    },
    ...split('custom'),
  },
];

export const getDietTemplate = (id: string): DietTemplate | undefined => {
  return DIET_TEMPLATES.find((d) => d.id === id) || DIET_TEMPLATES[0];
};
