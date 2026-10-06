import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Button from '../components/ui/Button';
import SegmentedControl from '../components/SegmentedControl';
import RouteMap from '../components/exerciseStats/RouteMap';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { usePreferences } from '../hooks/usePreferences';
import { formatLocalizedNumber } from '../localization';
import {
  RecordingPermissionError,
  discardRecording,
  elapsedSeconds,
  finishRecording,
  hydrate,
  pauseRecording,
  resumeRecording,
  startRecording,
  useGpsRecording,
} from '../services/gpsRecordingService';
import { saveRecordedActivity } from '../services/gpsRecordingSave';
import { addLog } from '../services/LogService';
import {
  computeSplits,
  currentPaceSecondsPerUnit,
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
  summarizeRecording,
  type RecordingActivity,
} from '../utils/gpsRecording';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RecordActivity'>;

const FEET_PER_METER = 3.28084;

type NotificationText = { title: string; body: string };

const notificationText = (
  t: TFunction,
  activity: RecordingActivity
): NotificationText => ({
  title: t('recordActivity.notification.title', {
    defaultValue: 'Recording your activity',
  }),
  body:
    activity === 'walk'
      ? t('recordActivity.notification.bodyWalk', {
          defaultValue: 'Tracking your walk with GPS',
        })
      : activity === 'run'
        ? t('recordActivity.notification.bodyRun', {
            defaultValue: 'Tracking your run with GPS',
          })
        : t('recordActivity.notification.bodyRide', {
            defaultValue: 'Tracking your ride with GPS',
          }),
});

const Stat: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <View className="flex-1 bg-surface rounded-xl p-3 mx-1 items-center">
    <Text className="text-text-muted text-xs mb-1">{label}</Text>
    <Text className="text-text-primary text-xl font-bold">{value}</Text>
    {unit ? <Text className="text-text-muted text-xs">{unit}</Text> : null}
  </View>
);

const RecordActivityScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel =
    distanceUnit === 'miles'
      ? t('recordActivity.unitMi', { defaultValue: 'mi' })
      : t('recordActivity.unitKm', { defaultValue: 'km' });

  const { session, points } = useGpsRecording();
  const [activity, setActivity] = useState<RecordingActivity>('run');
  const [busy, setBusy] = useState(false);
  const [permissionProblem, setPermissionProblem] = useState<
    'denied' | 'services-disabled' | null
  >(null);
  const [now, setNow] = useState(() => Date.now());

  useScreenHeader({
    title: t('screens.recordActivity', { defaultValue: 'Record Activity' }),
    nativeTitle: t('screens.recordActivity', {
      defaultValue: 'Record Activity',
    }),
    left: { kind: 'back' },
  });

  // Pick up a recording an earlier run left behind (app killed mid-activity).
  useEffect(() => {
    void hydrate();
  }, []);

  const isLive = session?.status === 'recording';
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  const summary = useMemo(() => summarizeRecording(points), [points]);
  const mapPoints = useMemo(
    () =>
      points.map((p) => ({
        t: new Date(p.t).toISOString(),
        lat: p.lat,
        lon: p.lon,
      })),
    [points]
  );
  const splits = useMemo(
    () =>
      session?.status === 'finished' ? computeSplits(points, unitMeters) : [],
    [points, session?.status, unitMeters]
  );

  const run = useCallback(
    async (work: () => Promise<void>, failure: string) => {
      setBusy(true);
      try {
        await work();
      } catch (error) {
        if (error instanceof RecordingPermissionError) {
          setPermissionProblem(error.reason);
        } else {
          addLog(`[GPS Recording] ${failure}: ${error}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: failure,
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  const handleStart = useCallback(
    () =>
      run(
        async () => {
          setPermissionProblem(null);
          await startRecording({
            activity,
            notification: notificationText(t, activity),
          });
        },
        t('recordActivity.errors.start', {
          defaultValue: 'Could not start recording',
        })
      ),
    [activity, run, t]
  );

  const handleResume = useCallback(
    () =>
      run(
        () =>
          resumeRecording(notificationText(t, session?.activity ?? activity)),
        t('recordActivity.errors.resume', {
          defaultValue: 'Could not resume recording',
        })
      ),
    [activity, run, session?.activity, t]
  );

  const handleFinish = useCallback(
    () =>
      run(
        finishRecording,
        t('recordActivity.errors.finish', {
          defaultValue: 'Could not finish recording',
        })
      ),
    [run, t]
  );

  const handleDiscard = useCallback(() => {
    Alert.alert(
      t('recordActivity.discard.title', {
        defaultValue: 'Discard this activity?',
      }),
      t('recordActivity.discard.message', {
        defaultValue: 'The recorded route and stats will be deleted.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('recordActivity.discard.confirm', {
            defaultValue: 'Discard',
          }),
          style: 'destructive',
          onPress: () =>
            void run(
              discardRecording,
              t('recordActivity.errors.discard', {
                defaultValue: 'Could not discard recording',
              })
            ),
        },
      ]
    );
  }, [run, t]);

  const handleSave = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const saved = await saveRecordedActivity(session, points, distanceUnit);
      await discardRecording();
      invalidateExerciseCache(queryClient, saved.entryDate);
      Toast.show({
        type: 'success',
        text1: t('recordActivity.saved', { defaultValue: 'Activity saved' }),
      });
      navigation.goBack();
    } catch (error) {
      addLog(`[GPS Recording] Save failed: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('recordActivity.errors.save', {
          defaultValue: 'Could not save activity',
        }),
        text2: t('recordActivity.errors.saveHint', {
          defaultValue: 'Your recording is kept on this phone. Try again.',
        }),
      });
    } finally {
      setBusy(false);
    }
  }, [distanceUnit, navigation, points, queryClient, session, t]);

  const number = (value: number, digits = 2) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const body = (() => {
    if (!session) {
      return (
        <>
          <Text className="text-text-secondary text-sm mb-3">
            {t('recordActivity.intro', {
              defaultValue:
                'Record a walk, run or ride with your phone’s GPS. Recording continues with the screen locked.',
            })}
          </Text>
          <SegmentedControl<RecordingActivity>
            segments={[
              {
                key: 'walk',
                label: t('recordActivity.activity.walk', {
                  defaultValue: 'Walk',
                }),
              },
              {
                key: 'run',
                label: t('recordActivity.activity.run', {
                  defaultValue: 'Run',
                }),
              },
              {
                key: 'ride',
                label: t('recordActivity.activity.ride', {
                  defaultValue: 'Ride',
                }),
              },
            ]}
            activeKey={activity}
            onSelect={setActivity}
          />
          {permissionProblem ? (
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm mb-3">
                {permissionProblem === 'denied'
                  ? t('recordActivity.permission.denied', {
                      defaultValue:
                        'SparkyFitness needs location access to record your route. You can allow it in Settings.',
                    })
                  : t('recordActivity.permission.servicesOff', {
                      defaultValue:
                        'Location services are turned off. Turn them on in Settings to record.',
                    })}
              </Text>
              <Button
                variant="outline"
                onPress={() => void Linking.openSettings()}
              >
                {t('recordActivity.permission.openSettings', {
                  defaultValue: 'Open Settings',
                })}
              </Button>
            </View>
          ) : null}
          {Platform.OS === 'android' ? (
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm font-semibold mb-1">
                {t('recordActivity.androidTips.title', {
                  defaultValue: 'Recording with the screen off',
                })}
              </Text>
              <Text className="text-text-secondary text-sm mb-3">
                {t('recordActivity.androidTips.body', {
                  defaultValue:
                    'Some phones stop apps that run in the background. If a recording has gaps, set SparkyFitness to “Unrestricted” in the phone’s battery settings.',
                })}
              </Text>
              <Button
                variant="link"
                onPress={() =>
                  void Linking.openURL('https://dontkillmyapp.com')
                }
              >
                {t('recordActivity.androidTips.link', {
                  defaultValue: 'Phone-specific steps',
                })}
              </Button>
            </View>
          ) : null}
          <Button
            className="mt-6"
            loading={busy}
            onPress={() => void handleStart()}
          >
            {t('recordActivity.start', { defaultValue: 'Start' })}
          </Button>
        </>
      );
    }

    const active = elapsedSeconds(session, now);
    const distance = summary.distanceMeters;
    const avgPace = paceSecondsPerUnit(
      distance,
      summary.activeSeconds,
      unitMeters
    );
    const currentPace = currentPaceSecondsPerUnit(points, unitMeters);
    const elevation =
      distanceUnit === 'miles'
        ? summary.elevationGainMeters * FEET_PER_METER
        : summary.elevationGainMeters;
    const elevationUnit =
      distanceUnit === 'miles'
        ? t('recordActivity.unitFt', { defaultValue: 'ft' })
        : t('recordActivity.unitM', { defaultValue: 'm' });
    const paceUnit = t('recordActivity.perUnit', {
      defaultValue: '/{{unit}}',
      unit: unitLabel,
    });
    const finished = session.status === 'finished';

    return (
      <>
        {points.length > 1 ? (
          <View className="mb-4">
            <RouteMap
              points={mapPoints}
              accessibilityLabel={t('recordActivity.routeA11y', {
                defaultValue: 'Map of your route so far',
              })}
            />
          </View>
        ) : (
          <View className="bg-surface rounded-xl p-4 mb-4 items-center">
            <ActivityIndicator />
            <Text className="text-text-muted text-sm mt-2">
              {t('recordActivity.waitingForGps', {
                defaultValue: 'Waiting for a GPS fix…',
              })}
            </Text>
          </View>
        )}
        <View className="items-center mb-4">
          <Text className="text-text-muted text-xs">
            {session.status === 'paused'
              ? t('recordActivity.status.paused', { defaultValue: 'Paused' })
              : finished
                ? t('recordActivity.status.finished', {
                    defaultValue: 'Finished',
                  })
                : t('recordActivity.time', { defaultValue: 'Time' })}
          </Text>
          <Text
            className="text-text-primary text-5xl font-bold"
            accessibilityLabel={formatClock(active)}
          >
            {formatClock(active)}
          </Text>
        </View>
        <View className="flex-row mb-3">
          <Stat
            label={t('recordActivity.distance', { defaultValue: 'Distance' })}
            value={number(distance / unitMeters)}
            unit={unitLabel}
          />
          <Stat
            label={t('recordActivity.avgPace', { defaultValue: 'Avg pace' })}
            value={formatPace(avgPace)}
            unit={paceUnit}
          />
        </View>
        <View className="flex-row mb-4">
          {finished ? (
            <Stat
              label={t('recordActivity.elevationLoss', {
                defaultValue: 'Elevation loss',
              })}
              value={number(
                distanceUnit === 'miles'
                  ? summary.elevationLossMeters * FEET_PER_METER
                  : summary.elevationLossMeters,
                0
              )}
              unit={elevationUnit}
            />
          ) : (
            <Stat
              label={t('recordActivity.currentPace', { defaultValue: 'Pace' })}
              value={formatPace(currentPace)}
              unit={paceUnit}
            />
          )}
          <Stat
            label={t('recordActivity.elevationGain', {
              defaultValue: 'Elevation gain',
            })}
            value={number(elevation, 0)}
            unit={elevationUnit}
          />
        </View>
        {finished && splits.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('recordActivity.splits', { defaultValue: 'Splits' })}
            </Text>
            {splits.map((split) => (
              <View key={split.index} className="flex-row justify-between py-1">
                <Text className="text-text-secondary text-sm">
                  {split.partial
                    ? number(split.distanceMeters / unitMeters)
                    : String(split.index)}{' '}
                  {unitLabel}
                </Text>
                <Text className="text-text-primary text-sm font-semibold">
                  {formatPace(
                    paceSecondsPerUnit(
                      split.distanceMeters,
                      split.durationSeconds,
                      unitMeters
                    )
                  )}{' '}
                  {paceUnit}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {finished ? (
          <>
            <Button loading={busy} onPress={() => void handleSave()}>
              {t('recordActivity.save', { defaultValue: 'Save activity' })}
            </Button>
            <Button
              variant="destructive"
              className="mt-2"
              disabled={busy}
              onPress={handleDiscard}
            >
              {t('recordActivity.discard.action', { defaultValue: 'Discard' })}
            </Button>
          </>
        ) : (
          <View className="flex-row">
            <Button
              variant="secondary"
              className="flex-1 mr-2"
              loading={busy}
              onPress={() =>
                void (session.status === 'recording'
                  ? run(
                      pauseRecording,
                      t('recordActivity.errors.pause', {
                        defaultValue: 'Could not pause recording',
                      })
                    )
                  : handleResume())
              }
            >
              {session.status === 'recording'
                ? t('recordActivity.pause', { defaultValue: 'Pause' })
                : t('recordActivity.resume', { defaultValue: 'Resume' })}
            </Button>
            <Button
              className="flex-1 ml-2"
              disabled={busy}
              onPress={() => void handleFinish()}
            >
              {t('recordActivity.finish', { defaultValue: 'Finish' })}
            </Button>
          </View>
        )}
      </>
    );
  })();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
    >
      {body}
    </ScrollView>
  );
};

export default RecordActivityScreen;
