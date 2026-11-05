import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type { GoalMetricKey } from '../constants/pinnedMetrics';
import { WATER_UNIT_LABELS } from '../utils/unitConversions';

/**
 * How each nutrition and hydration goal tile looks: the metric tokens from DESIGN.md
 * section 2 (Calorie Indigo, the macro hues, Hydration Steel Blue) and the unit shown
 * beside the figure. Water follows the account's water unit.
 */
export function useGoalMetricLook(waterUnit: string): {
  colors: Record<GoalMetricKey, string>;
  units: Record<GoalMetricKey, string>;
  trackColor: string;
} {
  const { t } = useTranslation();
  const [calories, protein, carbs, fat, water, trackColor] = useCSSVariable([
    '--color-calories',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-hydration',
    '--color-progress-track',
  ]) as [string, string, string, string, string, string];
  const grams = t('foodUnit.units.g', { defaultValue: 'g' });
  return {
    colors: { calories, protein, carbs, fat, water },
    units: {
      calories: t('nutrition.caloriesUnit', { defaultValue: 'Cal' }),
      protein: grams,
      carbs: grams,
      fat: grams,
      water: WATER_UNIT_LABELS[waterUnit] ?? waterUnit,
    },
    trackColor,
  };
}
