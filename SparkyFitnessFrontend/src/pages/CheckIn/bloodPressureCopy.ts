import type { TFunction } from 'i18next';
import type { BloodPressureCategory } from '@workspace/shared';

const CATEGORY_DEFAULTS: Record<BloodPressureCategory, string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  stage1: 'Stage 1',
  stage2: 'Stage 2',
  severe: 'Severe',
};

export function bloodPressureCategoryLabel(
  t: TFunction,
  category: BloodPressureCategory
): string {
  return t(`bloodPressure.categories.${category}`, CATEGORY_DEFAULTS[category]);
}

/** Badge colors by category; text stays readable in light and dark themes. */
export const BLOOD_PRESSURE_CATEGORY_CLASSES: Record<
  BloodPressureCategory,
  string
> = {
  normal: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  elevated:
    'bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200',
  stage1:
    'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  stage2: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  severe: 'bg-red-200 text-red-950 dark:bg-red-900 dark:text-red-100',
};
