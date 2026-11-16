import type { TFunction } from 'i18next';
import type {
  AppetiteCheckInVariant,
  AppetiteMetricKey,
} from '@workspace/shared';

import { glp1CheckInMetricLabel } from './medicationLocalization';

/**
 * A check-in metric's name. The GLP-1 check-in keeps its own wording ("Food
 * noise"); the hunger & fullness check-in calls the same score "Cravings".
 */
export function appetiteMetricLabel(
  key: AppetiteMetricKey,
  variant: AppetiteCheckInVariant,
  t: TFunction
): string {
  if (variant === 'glp1') return glp1CheckInMetricLabel(key, t);
  switch (key) {
    case 'hunger':
      return t('appetite.metric.hunger', { defaultValue: 'Hunger' });
    case 'food_noise':
      return t('appetite.metric.food_noise', { defaultValue: 'Cravings' });
    case 'fullness':
      return t('appetite.metric.fullness', { defaultValue: 'Fullness' });
    case 'energy':
      return t('appetite.metric.energy', { defaultValue: 'Energy' });
  }
}
