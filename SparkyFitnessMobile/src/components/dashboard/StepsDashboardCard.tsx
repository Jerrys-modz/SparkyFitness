import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { useHealthTrends } from '../../hooks/useHealthTrends';
import { formatLocalizedNumber } from '../../localization';
import { addDays } from '../../utils/dateUtils';
import DashboardCardHeader from './DashboardCardHeader';

interface StepsDashboardCardProps {
  date: string;
  steps: number;
  goal: number;
  onOpenTrends: () => void;
}

const BAR_AREA_HEIGHT = 48;
const WEEK_DAYS = 7;

/**
 * Steps on the Activity tab: the day's count against the goal, then the last seven days
 * as bars with the selected day in Sparky Blue. The bars use the same health-trend query
 * as the Health Trends card, so they cost nothing extra when that card is loaded.
 */
const StepsDashboardCard: React.FC<StepsDashboardCardProps> = ({
  date,
  steps,
  goal,
  onOpenTrends,
}) => {
  const { t } = useTranslation();
  const [accent, track] = useCSSVariable([
    '--color-accent-primary',
    '--color-progress-track',
  ]) as [string, string];
  const { steps: series } = useHealthTrends({
    range: '7d',
    activeTrends: ['steps'],
  });

  const byDay = new Map(series.data.map((point) => [point.day, point.steps]));
  byDay.set(date, steps);
  const week = Array.from({ length: WEEK_DAYS }, (_, index) => {
    const day = addDays(date, index - (WEEK_DAYS - 1));
    return { day, steps: byDay.get(day) ?? 0 };
  });
  const peak = Math.max(1, goal, ...week.map((entry) => entry.steps));
  const percent = goal > 0 ? Math.round((steps / goal) * 100) : null;

  if (steps <= 0 && week.every((entry) => entry.steps <= 0)) return null;

  return (
    <Pressable
      testID="steps-dashboard-card"
      onPress={onOpenTrends}
      accessibilityRole="button"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <DashboardCardHeader
        icon="exercise-walking"
        title={t('dashboard.stepsCard.title', { defaultValue: 'Steps' })}
        actionLabel={t('dashboard.stepsCard.trends', {
          defaultValue: 'Trends',
        })}
        onPressAction={onOpenTrends}
      />
      <View className="flex-row items-baseline gap-2 mb-3">
        <Text className="text-3xl font-bold text-text-primary">
          {formatLocalizedNumber(Math.round(steps))}
        </Text>
        {goal > 0 && (
          <Text className="text-sm text-text-secondary">
            {t('dashboard.stepsCard.ofGoal', {
              defaultValue: '/ {{goal}} steps ({{percent}}%)',
              goal: formatLocalizedNumber(Math.round(goal)),
              percent: formatLocalizedNumber(percent ?? 0),
            })}
          </Text>
        )}
      </View>
      <View
        testID="steps-dashboard-card-week"
        className="flex-row items-end gap-1.5"
        style={{ height: BAR_AREA_HEIGHT }}
      >
        {week.map((entry) => (
          <View
            key={entry.day}
            className="flex-1 rounded-sm"
            style={{
              height: Math.max(
                3,
                Math.round((entry.steps / peak) * BAR_AREA_HEIGHT)
              ),
              backgroundColor: entry.day === date ? accent : track,
            }}
          />
        ))}
      </View>
      <Text className="text-xs text-text-muted mt-1">
        {t('dashboard.stepsCard.lastSevenDays', {
          defaultValue: 'Last 7 days',
        })}
      </Text>
    </Pressable>
  );
};

export default StepsDashboardCard;
