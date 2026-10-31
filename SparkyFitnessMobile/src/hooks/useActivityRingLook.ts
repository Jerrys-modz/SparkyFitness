import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type { ActivityRingKey } from '../constants/activityRings';

/**
 * How each activity ring looks, in one place for the Activity Rings card and the Pinned
 * Metrics card. Colors are the metric tokens (DESIGN.md section 2): watch-measured active
 * energy for Move, Exercise Mint, Sparky Blue for steps, and Heart-Rate Red for Active
 * points, which are derived from heart rate zones.
 */
export function useActivityRingLook(): {
  colors: Record<ActivityRingKey, string>;
  units: Record<ActivityRingKey, string>;
  trackColor: string;
} {
  const { t } = useTranslation();
  const [move, exercise, steps, points, trackColor] = useCSSVariable([
    '--color-active-energy',
    '--color-exercise',
    '--color-accent-primary',
    '--color-heart-rate',
    '--color-progress-track',
  ]) as [string, string, string, string, string];
  return {
    colors: { move, exercise, steps, points },
    units: {
      move: t('nutrition.caloriesUnit', { defaultValue: 'Cal' }),
      exercise: t('activityRings.minutesUnit', { defaultValue: 'min' }),
      steps: t('activityRings.stepsUnit', { defaultValue: 'steps' }),
      points: t('activityRings.pointsUnit', { defaultValue: 'pts' }),
    },
    trackColor,
  };
}
