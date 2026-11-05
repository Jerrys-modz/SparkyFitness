import type { TFunction } from 'i18next';
import type { ReadinessFactor, ReadinessLevel } from '@workspace/shared';

/** Text tone for each readiness level, shared by the Exercise report and the Dashboard. */
export const READINESS_LEVEL_COLOR: Record<ReadinessLevel, string> = {
  noData: 'text-text-secondary',
  low: 'text-text-danger-subtle',
  moderate: 'text-text-warning',
  high: 'text-text-success',
};

/** One sentence on what today's readiness level means for training. */
export const readinessLevelText = (
  level: ReadinessLevel,
  t: TFunction
): string => {
  switch (level) {
    case 'high':
      return t('exerciseStatistics.fitness.level.high', {
        defaultValue: 'Ready for a hard session.',
      });
    case 'moderate':
      return t('exerciseStatistics.fitness.level.moderate', {
        defaultValue: 'Fine for a normal session, but not your hardest.',
      });
    case 'low':
      return t('exerciseStatistics.fitness.level.low', {
        defaultValue: 'Not recovered. An easy day or rest is the better call.',
      });
    default:
      return t('exerciseStatistics.fitness.level.noData', {
        defaultValue:
          'Not enough to go on yet. Log workouts and sleep to see your readiness.',
      });
  }
};

/** The name of one input to the readiness score. */
export const readinessFactorLabel = (
  factor: ReadinessFactor,
  t: TFunction
): string => {
  switch (factor) {
    case 'form':
      return t('exerciseStatistics.fitness.factor.form', {
        defaultValue: 'Training form',
      });
    case 'sleep':
      return t('exerciseStatistics.fitness.factor.sleep', {
        defaultValue: 'Sleep',
      });
    case 'restingHeartRate':
      return t('exerciseStatistics.fitness.factor.restingHeartRate', {
        defaultValue: 'Resting heart rate',
      });
    default:
      return t('exerciseStatistics.fitness.factor.hrv', {
        defaultValue: 'HRV',
      });
  }
};
