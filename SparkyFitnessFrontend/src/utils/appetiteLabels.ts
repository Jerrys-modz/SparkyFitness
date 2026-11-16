import type { TFunction } from 'i18next';
import type {
  AppetiteCheckInVariant,
  AppetiteMetricKey,
} from '@workspace/shared';

/** The metric's name in this check-in; cravings are GLP-1's food noise. */
export function appetiteMetricLabel(
  key: AppetiteMetricKey,
  variant: AppetiteCheckInVariant,
  t: TFunction
): string {
  if (variant === 'glp1') {
    switch (key) {
      case 'hunger':
        return t('medications.checkin.metric.hunger', 'Hunger');
      case 'food_noise':
        return t('medications.checkin.metric.food_noise', 'Food noise');
      case 'fullness':
        return t('medications.checkin.metric.fullness', 'Fullness');
      case 'energy':
        return t('medications.checkin.metric.energy', 'Energy');
    }
  }
  switch (key) {
    case 'hunger':
      return t('checkIn.appetite.metric.hunger', 'Hunger');
    case 'food_noise':
      return t('checkIn.appetite.metric.food_noise', 'Cravings');
    case 'fullness':
      return t('checkIn.appetite.metric.fullness', 'Fullness');
    case 'energy':
      return t('checkIn.appetite.metric.energy', 'Energy');
  }
}
