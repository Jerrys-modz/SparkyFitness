import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Route, RouteRun } from '@workspace/shared';
import Icon from './Icon';
import { formatDayLabel } from '../utils/dayLabel';
import { formatClock } from '../utils/gpsRecording';
import { formatRouteDistance } from '../utils/routeDisplay';
import { formatRunPace, routeTrend } from '../utils/routeHistory';
import { raceTimeText } from '../utils/routeRace';

interface Props {
  route: Pick<Route, 'runCount' | 'bestDurationSeconds' | 'lastRunDate'>;
  runs: readonly RouteRun[];
  unit: 'km' | 'miles';
  onOpenRun: (entryId: string) => void;
}

const BAR_AREA_HEIGHT = 32;

/** The runs and walks done on a route: count, best and last time, a trend and the list. */
const RouteHistoryCard: React.FC<Props> = ({
  route,
  runs,
  unit,
  onOpenRun,
}) => {
  const { t } = useTranslation();
  const trend = routeTrend(runs);
  const slowest = trend ? Math.max(...trend.durations) : 0;
  const trendText = trend
    ? trend.direction === 'steady'
      ? t('routes.history.trendSteady', {
          defaultValue: 'About the same as your recent runs',
        })
      : trend.direction === 'faster'
        ? t('routes.history.trendFaster', {
            time: raceTimeText(trend.deltaSeconds),
            defaultValue: '{{time}} faster than your recent runs',
          })
        : t('routes.history.trendSlower', {
            time: raceTimeText(trend.deltaSeconds),
            defaultValue: '{{time}} slower than your recent runs',
          })
    : null;

  return (
    <View className="bg-surface rounded-xl p-4 mt-4" testID="route-history">
      <Text className="text-text-primary text-sm font-semibold">
        {t('routes.history.title', { defaultValue: 'History' })}
      </Text>
      {route.runCount === 0 ? (
        <Text className="text-text-secondary text-sm mt-1">
          {t('routes.history.empty', {
            defaultValue:
              'No runs yet. A run or walk recorded on this route is listed here.',
          })}
        </Text>
      ) : (
        <>
          <View className="flex-row justify-between mt-2">
            <View>
              <Text className="text-text-secondary text-xs">
                {t('routes.history.runs', { defaultValue: 'Runs' })}
              </Text>
              <Text
                className="text-text-primary text-base font-semibold"
                testID="route-history-count"
              >
                {route.runCount}
              </Text>
            </View>
            <View>
              <Text className="text-text-secondary text-xs">
                {t('routes.history.best', { defaultValue: 'Best' })}
              </Text>
              <Text
                className="text-text-primary text-base font-semibold"
                testID="route-history-best"
              >
                {route.bestDurationSeconds !== null
                  ? formatClock(route.bestDurationSeconds)
                  : '—'}
              </Text>
            </View>
            <View>
              <Text className="text-text-secondary text-xs">
                {t('routes.history.last', { defaultValue: 'Last run' })}
              </Text>
              <Text
                className="text-text-primary text-base font-semibold"
                testID="route-history-last"
              >
                {route.lastRunDate ? formatDayLabel(route.lastRunDate) : '—'}
              </Text>
            </View>
          </View>
          {trend ? (
            <View className="mt-3" testID="route-history-trend">
              <View
                className="flex-row items-end gap-1"
                style={{ height: BAR_AREA_HEIGHT }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {trend.durations.map((seconds, index) => (
                  <View
                    key={index}
                    className="flex-1 rounded-sm bg-accent-primary"
                    style={{
                      height: Math.max(
                        4,
                        Math.round((seconds / slowest) * BAR_AREA_HEIGHT)
                      ),
                    }}
                  />
                ))}
              </View>
              <Text className="text-text-secondary text-xs mt-1">
                {trendText}
              </Text>
            </View>
          ) : null}
          {runs.map((run) => (
            <Pressable
              key={run.entryId}
              className="flex-row items-center justify-between pt-3 mt-3 border-t border-border-subtle"
              onPress={() => onOpenRun(run.entryId)}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
              accessibilityRole="button"
              testID={`route-run-${run.entryId}`}
            >
              <View className="flex-1 mr-3">
                <Text className="text-text-primary text-sm font-semibold">
                  {formatDayLabel(run.date)}
                </Text>
                <Text className="text-text-secondary text-xs mt-0.5">
                  {[
                    formatClock(run.durationSeconds),
                    run.distanceM !== null
                      ? formatRouteDistance(run.distanceM, unit)
                      : null,
                    run.paceSecPerKm !== null
                      ? `${formatRunPace(run.paceSecPerKm, unit)} ${t(
                          'recordActivity.perUnit',
                          {
                            defaultValue: '/{{unit}}',
                            unit: unit === 'miles' ? 'mi' : 'km',
                          }
                        )}`
                      : null,
                    run.avgHeartRate !== null
                      ? t('routes.history.heartRate', {
                          defaultValue: '{{bpm}} bpm',
                          bpm: Math.round(run.avgHeartRate),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Icon name="chevron-forward" size={20} color="#999" />
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
};

export default RouteHistoryCard;
