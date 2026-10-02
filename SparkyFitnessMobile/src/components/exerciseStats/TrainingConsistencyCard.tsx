import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import type { TrainingConsistency } from '@workspace/shared';
import StatusView from '../StatusView';
import { formatLocalizedNumber } from '../../localization';
import { localizeExerciseTaxonomyValue } from '../../localization/exerciseTaxonomy';
import {
  muscleWeekRows,
  trainingCalendarWeeks,
} from '../../utils/trainingConsistency';

interface TrainingConsistencyCardProps {
  data: TrainingConsistency | undefined;
  isLoading: boolean;
  isError: boolean;
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-1 items-center">
    <Text className="text-text-secondary text-xs mb-1">{label}</Text>
    <Text className="text-text-primary text-lg font-bold">{value}</Text>
  </View>
);

const TrainingConsistencyCard: React.FC<TrainingConsistencyCardProps> = ({
  data,
  isLoading,
  isError,
}) => {
  const { t } = useTranslation();
  const calendar = useMemo(
    () => (data ? trainingCalendarWeeks(data) : []),
    [data]
  );
  const rows = useMemo(
    () => (data ? muscleWeekRows(data.muscleSets) : []),
    [data]
  );

  const weeksLabel = (count: number) =>
    t('exerciseStatistics.consistency.weeks', {
      count,
      formattedCount: formatLocalizedNumber(count),
      defaultValue: '{{formattedCount}} weeks',
      defaultValue_one: '{{formattedCount}} week',
      defaultValue_other: '{{formattedCount}} weeks',
    });

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (!data) {
      return isError ? (
        <Text className="text-text-secondary text-sm">
          {t('exerciseStatistics.consistency.loadFailed', {
            defaultValue: 'Could not load your training consistency.',
          })}
        </Text>
      ) : null;
    }
    const lastWeek = data.weeks[data.weeks.length - 1];
    return (
      <>
        <View className="flex-row mb-4">
          <Stat
            label={t('exerciseStatistics.consistency.streak', {
              defaultValue: 'Week streak',
            })}
            value={weeksLabel(data.weeklyStreak.current)}
          />
          <Stat
            label={t('exerciseStatistics.consistency.longest', {
              defaultValue: 'Longest',
            })}
            value={weeksLabel(data.weeklyStreak.longest)}
          />
          <Stat
            label={t('exerciseStatistics.consistency.thisWeek', {
              defaultValue: 'This week',
            })}
            value={t('exerciseStatistics.consistency.days', {
              count: lastWeek?.workoutDays ?? 0,
              formattedCount: formatLocalizedNumber(lastWeek?.workoutDays ?? 0),
              defaultValue: '{{formattedCount}} days',
              defaultValue_one: '{{formattedCount}} day',
              defaultValue_other: '{{formattedCount}} days',
            })}
          />
        </View>

        <View
          className="flex-row self-stretch"
          accessible
          accessibilityLabel={t('exerciseStatistics.consistency.calendarA11y', {
            count: data.trainingDays.length,
            weeks: data.weeks.length,
            defaultValue:
              'Training calendar: {{count}} workout days in the last {{weeks}} weeks',
            defaultValue_one:
              'Training calendar: {{count}} workout day in the last {{weeks}} weeks',
            defaultValue_other:
              'Training calendar: {{count}} workout days in the last {{weeks}} weeks',
          })}
        >
          {calendar.map((week) => (
            <View key={week.weekStart} className="flex-1 px-px">
              {week.cells.map((cell) => (
                <View
                  key={cell.day}
                  testID={`consistency-${cell.state}`}
                  className={`rounded-sm mb-0.5 ${
                    cell.state === 'trained'
                      ? 'bg-exercise'
                      : cell.state === 'rest'
                        ? 'bg-progress-track'
                        : 'bg-transparent'
                  }`}
                  style={{ aspectRatio: 1 }}
                />
              ))}
            </View>
          ))}
        </View>

        <Text className="text-text-primary text-sm font-bold mt-4 mb-1">
          {t('exerciseStatistics.consistency.setsTitle', {
            defaultValue: 'Sets per muscle',
          })}
        </Text>
        {rows.length === 0 ? (
          <Text className="text-text-muted text-xs">
            {t('exerciseStatistics.consistency.noSets', {
              defaultValue: 'No sets logged this week or last.',
            })}
          </Text>
        ) : (
          <>
            <View className="flex-row justify-end pb-1">
              <Text className="text-xs text-text-muted w-20 text-right">
                {t('exerciseStatistics.consistency.thisWeek', {
                  defaultValue: 'This week',
                })}
              </Text>
              <Text className="text-xs text-text-muted w-20 text-right">
                {t('exerciseStatistics.consistency.lastWeek', {
                  defaultValue: 'Last week',
                })}
              </Text>
            </View>
            {rows.map((row, index) => (
              <View
                key={row.muscle}
                className={`flex-row items-center py-2 ${
                  index === rows.length - 1
                    ? ''
                    : 'border-b border-border-subtle'
                }`}
              >
                <Text className="flex-1 text-text-primary text-sm">
                  {localizeExerciseTaxonomyValue(t, 'muscle', row.muscle)}
                </Text>
                <Text className="w-20 text-right text-text-primary text-sm font-semibold">
                  {formatLocalizedNumber(row.thisWeek)}
                </Text>
                <Text className="w-20 text-right text-text-secondary text-sm">
                  {formatLocalizedNumber(row.lastWeek)}
                </Text>
              </View>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.consistency.title', {
          defaultValue: 'Training Consistency',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.consistency.subtitle', {
          count: data?.weeks.length ?? 0,
          formattedCount: formatLocalizedNumber(data?.weeks.length ?? 0),
          defaultValue: 'Last {{formattedCount}} weeks, Monday to Sunday',
          defaultValue_one: 'Last {{formattedCount}} week, Monday to Sunday',
          defaultValue_other: 'Last {{formattedCount}} weeks, Monday to Sunday',
        })}
      </Text>
      {renderBody()}
    </View>
  );
};

export default TrainingConsistencyCard;
