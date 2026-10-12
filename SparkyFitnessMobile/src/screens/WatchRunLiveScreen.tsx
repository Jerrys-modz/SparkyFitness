import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import { Stat } from '../components/recording/SplitRow';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { formatLocalizedNumber } from '../localization';
import { useWatchRunLive } from '../stores/watchRunLiveStore';
import {
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
} from '../utils/gpsRecording';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'WatchRunLive'>;

/**
 * How a walk or run recorded on the watch alone is going, on the phone: the
 * clock, distance, pace, heart rate and, when it follows a plan, the step. It
 * only shows what the watch sends; pausing and finishing are on the wrist, and
 * the finished run is filed in the diary by the usual hand-off.
 */
const WatchRunLiveScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const run = useWatchRunLive();
  const miles = preferences?.default_distance_unit === 'miles';
  const unitMeters = miles ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel = miles
    ? t('recordActivity.unitMi', { defaultValue: 'mi' })
    : t('recordActivity.unitKm', { defaultValue: 'km' });
  const paceUnit = t('recordActivity.perUnit', {
    defaultValue: '/{{unit}}',
    unit: unitLabel,
  });
  const header = useScreenHeader({
    title: t('screens.watchRunLive', { defaultValue: 'Run on your watch' }),
    left: { kind: 'back' },
  });
  const number = (value: number, digits = 2) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {run == null ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base text-center mb-4">
              {t('watchRunLive.ended', {
                defaultValue:
                  'The run on your watch has ended or is out of range. A finished run is added to your diary.',
              })}
            </Text>
            <Button onPress={() => navigation.goBack()}>
              {t('common.done', { defaultValue: 'Done' })}
            </Button>
          </View>
        ) : (
          <>
            <View className="items-center mb-4">
              <Text className="text-text-muted text-sm">
                {run.status === 'paused'
                  ? run.autoPaused
                    ? t('watchRunLive.autoPaused', {
                        defaultValue: 'Auto-paused',
                      })
                    : t('recordActivity.status.paused', {
                        defaultValue: 'Paused',
                      })
                  : run.kind === 'walk'
                    ? t('watchRunLive.walking', {
                        defaultValue: 'Walking on your watch',
                      })
                    : t('watchRunLive.running', {
                        defaultValue: 'Running on your watch',
                      })}
              </Text>
              <Text
                className="text-text-primary text-5xl font-bold mt-1"
                accessibilityLabel={formatClock(run.elapsedNow)}
              >
                {formatClock(run.elapsedNow)}
              </Text>
            </View>

            {run.stepLabel ? (
              <View className="bg-surface rounded-xl p-4 mb-3 items-center">
                <Text className="text-text-primary text-xl font-bold">
                  {run.stepLabel}
                </Text>
                {run.stepRemainingNow != null ? (
                  <Text className="text-text-secondary text-base mt-1">
                    {formatClock(Math.ceil(run.stepRemainingNow))}
                  </Text>
                ) : null}
                {run.nextLabel ? (
                  <Text className="text-text-muted text-sm mt-1">
                    {t('watchRunLive.next', {
                      defaultValue: 'Next: {{step}}',
                      step: run.nextLabel,
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View className="flex-row mb-3">
              <Stat
                label={t('recordActivity.distance', {
                  defaultValue: 'Distance',
                })}
                value={number(run.distanceMeters / unitMeters)}
                unit={unitLabel}
              />
              <Stat
                label={t('recordActivity.avgPace', {
                  defaultValue: 'Avg pace',
                })}
                value={formatPace(
                  paceSecondsPerUnit(
                    run.distanceMeters,
                    run.elapsedNow,
                    unitMeters
                  )
                )}
                unit={paceUnit}
              />
            </View>
            <View className="flex-row mb-3">
              {run.heartRate != null ? (
                <Stat
                  label={t('runSummary.heartRate', {
                    defaultValue: 'Heart rate',
                  })}
                  value={number(run.heartRate, 0)}
                  unit={t('recordActivity.unitBpm', { defaultValue: 'bpm' })}
                />
              ) : null}
              <Stat
                label={t('watchRunLive.calories', { defaultValue: 'Calories' })}
                value={number(run.energyKcal, 0)}
                unit={t('watchRunLive.kcal', { defaultValue: 'kcal' })}
              />
              {run.lapCount > 0 ? (
                <Stat
                  label={t('recordActivity.laps', { defaultValue: 'Laps' })}
                  value={number(run.lapCount, 0)}
                />
              ) : null}
            </View>

            {run.place === 'indoor' ? (
              <Text className="text-text-muted text-xs text-center">
                {t('watchRunLive.indoorNote', {
                  defaultValue:
                    'Indoors the distance is the watch’s estimate. You can correct it to the treadmill’s figure after the run.',
                })}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
};

export default WatchRunLiveScreen;
