import type { TFunction } from 'i18next';
import type { BloodPressureCategory } from '@workspace/shared';

export function bloodPressureCategoryLabel(
  t: TFunction,
  category: BloodPressureCategory
): string {
  switch (category) {
    case 'normal':
      return t('bloodPressure.categories.normal', { defaultValue: 'Normal' });
    case 'elevated':
      return t('bloodPressure.categories.elevated', {
        defaultValue: 'Elevated',
      });
    case 'stage1':
      return t('bloodPressure.categories.stage1', { defaultValue: 'Stage 1' });
    case 'stage2':
      return t('bloodPressure.categories.stage2', { defaultValue: 'Stage 2' });
    case 'severe':
      return t('bloodPressure.categories.severe', { defaultValue: 'Severe' });
  }
}

/** Server values outside the known set are shown as stored. */
export function bloodPressureArmLabel(t: TFunction, arm: string): string {
  switch (arm) {
    case 'left':
      return t('bloodPressure.arms.left', { defaultValue: 'Left arm' });
    case 'right':
      return t('bloodPressure.arms.right', { defaultValue: 'Right arm' });
    default:
      return arm;
  }
}

export function bloodPressurePositionLabel(
  t: TFunction,
  position: string
): string {
  switch (position) {
    case 'sitting':
      return t('bloodPressure.positions.sitting', { defaultValue: 'Sitting' });
    case 'standing':
      return t('bloodPressure.positions.standing', {
        defaultValue: 'Standing',
      });
    case 'lying':
      return t('bloodPressure.positions.lying', { defaultValue: 'Lying down' });
    case 'reclining':
      return t('bloodPressure.positions.reclining', {
        defaultValue: 'Reclining',
      });
    default:
      return position;
  }
}

/** Text color class of a category: calm for normal, warning, then danger. */
export function bloodPressureCategoryTextClass(
  category: BloodPressureCategory
): string {
  switch (category) {
    case 'normal':
      return 'text-text-primary';
    case 'elevated':
    case 'stage1':
      return 'text-text-warning';
    case 'stage2':
    case 'severe':
      return 'text-text-danger-subtle';
  }
}
