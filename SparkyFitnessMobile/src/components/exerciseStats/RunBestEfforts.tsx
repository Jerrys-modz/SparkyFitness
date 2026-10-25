import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  formatRaceTime,
  type BestEffort,
  type BestEffortBoardItem,
} from '@workspace/shared';
import { bestEffortIdsForUnit } from '../../utils/bestEfforts';
import { BEST_EFFORT_LABELS, effortPaceText } from './BestEffortsCard';

interface RunBestEffortsProps {
  efforts: readonly BestEffort[];
  distanceUnit: 'km' | 'miles';
  /** The all-time board, to mark a stretch that is the person's best ever. */
  board?: readonly BestEffortBoardItem[];
  /** This run's entry id. */
  activityId: string;
}

/**
 * "Fastest 1 km of this run" and the other distances the run is long enough
 * for, with a mark on any that is also the person's best ever.
 */
const RunBestEfforts: React.FC<RunBestEffortsProps> = ({
  efforts,
  distanceUnit,
  board = [],
  activityId,
}) => {
  const { t } = useTranslation();
  const rows = bestEffortIdsForUnit(distanceUnit)
    .map((id) => efforts.find((effort) => effort.id === id))
    .filter((effort): effort is BestEffort => effort !== undefined);
  if (rows.length === 0) return null;

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
      testID="run-best-efforts"
    >
      <Text className="text-text-primary text-base font-bold mb-2">
        {t('exerciseStatistics.cardio.bestEfforts.runTitle', {
          defaultValue: 'Fastest stretches in this run',
        })}
      </Text>
      {rows.map((effort) => {
        const isBestEver = board.some(
          (item) => item.id === effort.id && item.activityId === activityId
        );
        return (
          <View
            key={effort.id}
            testID={`run-best-effort-${effort.id}`}
            className="flex-row justify-between items-center py-1.5"
          >
            <View className="flex-1 pr-2">
              <Text className="text-text-primary text-sm font-semibold">
                {t('exerciseStatistics.cardio.bestEfforts.fastest', {
                  defaultValue: 'Fastest {{distance}}',
                  distance: BEST_EFFORT_LABELS[effort.id](t),
                })}
              </Text>
              {isBestEver ? (
                <Text className="text-accent-primary text-xs font-semibold">
                  {t('exerciseStatistics.cardio.bestEfforts.bestEver', {
                    defaultValue: 'Your best ever',
                  })}
                </Text>
              ) : null}
            </View>
            <View className="items-end">
              <Text className="text-text-primary text-base font-semibold">
                {formatRaceTime(effort.seconds)}
              </Text>
              <Text className="text-text-secondary text-xs">
                {effortPaceText(
                  t,
                  effort.distanceMeters,
                  effort.seconds,
                  distanceUnit
                )}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

export default RunBestEfforts;
