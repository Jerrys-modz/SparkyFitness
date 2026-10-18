import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import RouteElevationCard from '../components/exerciseStats/RouteElevationCard';
import RouteTileMap from '../components/exerciseStats/RouteTileMap';
import RouteCueList from '../components/RouteCueList';
import RouteStopsSection from '../components/RouteStopsSection';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useWatchConnectivity } from '../hooks/useWatchConnectivity';
import { useWatchRouteStatus } from '../hooks/useWatchRouteStatus';
import { useWatchRouteStore } from '../stores/watchRouteStore';
import { getRecordingPreferences } from '../services/gpsRecordingService';
import { addLog } from '../services/LogService';
import { openRunEntry } from '../services/openRunEntry';
import {
  removeRoute,
  renameRoute,
  shareRouteGpx,
  useRoute,
  useRouteRuns,
  useRouteStops,
} from '../services/routeService';
import { useSegments } from '../services/segmentService';
import { startRunOnWatch } from '../services/watchRunControl';
import {
  removeRouteFromWatch,
  sendRouteToWatch,
} from '../services/watchRouteSync';
import { formatDayLabel } from '../utils/dayLabel';
import { formatClock } from '../utils/gpsRecording';
import { formatRouteClimb, formatRouteDistance } from '../utils/routeDisplay';
import { formatRunPace } from '../utils/routeHistory';
import { formatSegmentTime, segmentTitle } from '../utils/segmentDisplay';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RouteDetail'>;

/**
 * One saved route: its map and numbers, rename, share as GPX, delete, start it
 * (on the watch when one is paired, otherwise with the phone's GPS) and, with a
 * watch, keep a copy on it for runs without the phone.
 */
const RouteDetailScreen: React.FC<Props> = ({ navigation, route: nav }) => {
  const { id } = nav.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { route, isLoading, isError, refetch } = useRoute(id);
  const { runs } = useRouteRuns(id);
  const routeStops = useRouteStops(id);
  const { segments } = useSegments();
  const routeSegments = segments.filter(
    (segment) => segment.sourceRouteId === id
  );
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { isPaired: watchPaired } = useWatchConnectivity();
  const watchStatus = useWatchRouteStatus(route);
  const offlineMapLines = useWatchRouteStore((s) => s.footprints[id]);
  const [watchBusy, setWatchBusy] = useState(false);

  const header = useScreenHeader({
    title: route?.name ?? t('screens.routes', { defaultValue: 'Routes' }),
    left: { kind: 'back' },
  });

  const fail = (text: string, error: unknown) => {
    addLog(`[Routes] ${text}: ${error}`, 'WARNING');
    Toast.show({ type: 'error', text1: text });
  };

  const saveName = () => {
    const next = name?.trim();
    if (!next) return;
    setBusy(true);
    void renameRoute(id, { name: next })
      .then(() => setName(null))
      .catch((error: unknown) =>
        fail(
          t('routes.renameFailed', { defaultValue: 'Could not rename' }),
          error
        )
      )
      .finally(() => setBusy(false));
  };

  const share = () => {
    if (!route) return;
    void shareRouteGpx(route).catch((error: unknown) =>
      fail(
        t('routes.shareFailed', { defaultValue: 'Could not share the route' }),
        error
      )
    );
  };

  const sendToWatch = () => {
    if (!route) return;
    setWatchBusy(true);
    void sendRouteToWatch(route)
      .then(() =>
        Toast.show({
          type: 'success',
          text1: t('routes.watch.sent', {
            defaultValue: 'Sent to your watch',
          }),
        })
      )
      .catch((error: unknown) =>
        fail(
          t('routes.watch.sendFailed', {
            defaultValue: 'Could not send the route to your watch',
          }),
          error
        )
      )
      .finally(() => setWatchBusy(false));
  };

  const removeFromWatch = () => {
    setWatchBusy(true);
    void removeRouteFromWatch(id)
      .catch((error: unknown) =>
        fail(
          t('routes.watch.removeFailed', {
            defaultValue: 'Could not remove the route from your watch',
          }),
          error
        )
      )
      .finally(() => setWatchBusy(false));
  };

  const startOnWatch = (kind: 'run' | 'walk') => {
    if (!route) return;
    setBusy(true);
    void getRecordingPreferences()
      .then((preferences) =>
        startRunOnWatch({
          kind,
          place: 'outdoor',
          autoPause: preferences.autoPause,
          voiceCues: preferences.audioCues,
          route,
        })
      )
      .then(() => navigation.navigate('WatchRunLive'))
      .catch((error: unknown) =>
        fail(
          t('routes.watch.startFailed', {
            defaultValue: 'Could not start on your watch',
          }),
          error
        )
      )
      .finally(() => setBusy(false));
  };

  const start = () => {
    if (!watchPaired) {
      navigation.navigate('RecordActivity', { routeId: id });
      return;
    }
    Alert.alert(
      t('routes.watch.startTitle', { defaultValue: 'Start on your watch' }),
      t('routes.watch.startMessage', {
        defaultValue: 'Your watch follows the route and buzzes at each turn.',
      }),
      [
        {
          text: t('recordActivity.activity.run', { defaultValue: 'Run' }),
          onPress: () => startOnWatch('run'),
        },
        {
          text: t('recordActivity.activity.walk', { defaultValue: 'Walk' }),
          onPress: () => startOnWatch('walk'),
        },
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
      ]
    );
  };

  const openRun = (entryId: string) => {
    void openRunEntry(navigation, entryId, unit).catch((error: unknown) => {
      addLog(`[Routes] Could not open the run: ${error}`, 'WARNING');
      Toast.show({
        type: 'error',
        text1: t('routes.history.openFailed', {
          defaultValue: 'Could not open that run',
        }),
        text2: t('routes.history.openFailedHint', {
          defaultValue: 'It may have been deleted from your diary.',
        }),
      });
    });
  };

  const watchStatusText: Record<typeof watchStatus, string | null> = {
    none: null,
    pending: t('routes.watch.pending', {
      defaultValue: 'Sent. Waiting for your watch to confirm.',
    }),
    onWatch: t('routes.watch.onWatch', { defaultValue: 'On your watch' }),
    outdated: t('routes.watch.outdated', {
      defaultValue: 'Out of date, send again',
    }),
    full: t('routes.watch.full', {
      defaultValue:
        'Your watch is full. Remove a route from it, then send this one again.',
    }),
  };

  const confirmDelete = () =>
    Alert.alert(
      t('routes.deleteTitle', { defaultValue: 'Delete this route?' }),
      t('routes.deleteMessage', {
        defaultValue: 'Recorded activities it was saved from are not affected.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            void removeRoute(id)
              .then(() => navigation.goBack())
              .catch((error: unknown) =>
                fail(
                  t('routes.deleteFailed', {
                    defaultValue: 'Could not delete the route',
                  }),
                  error
                )
              );
          },
        },
      ]
    );

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
        {isLoading ? (
          <ActivityIndicator />
        ) : isError || !route ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('routes.loadOneFailed', {
                defaultValue: 'Could not load this route.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <>
            <RouteTileMap
              points={route.points}
              stops={routeStops.stops?.stops}
              accessibilityLabel={t('routes.mapA11y', {
                defaultValue:
                  'Map of this route, from the green dot to the red ring',
              })}
            />
            <RouteElevationCard points={route.points} unit={unit} />
            <View className="bg-surface rounded-xl p-4 mt-4">
              {name === null ? (
                <Text className="text-text-primary text-lg font-bold">
                  {route.name}
                </Text>
              ) : (
                <TextInput
                  className="border-b border-border-subtle text-text-primary py-1"
                  style={{ fontSize: 17 }}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  autoFocus
                  accessibilityLabel={t('routes.nameLabel', {
                    defaultValue: 'Route name',
                  })}
                />
              )}
              <Text className="text-text-secondary text-sm mt-2">
                {formatRouteDistance(route.distanceM, unit)}
                {route.elevationGainM !== null
                  ? ` · ${t('routes.climb', {
                      climb: formatRouteClimb(route.elevationGainM, unit),
                      defaultValue: '{{climb}} climb',
                    })}`
                  : ''}
              </Text>
            </View>
            <View
              className="bg-surface rounded-xl p-4 mt-4"
              testID="route-history"
            >
              <Text className="text-text-primary text-sm font-semibold">
                {t('routes.history.title', { defaultValue: 'History' })}
              </Text>
              {route.runCount === 0 ? (
                <Text className="text-text-secondary text-sm mt-1">
                  {t('routes.history.empty', {
                    defaultValue:
                      'No runs yet. A run or walk that follows this route is listed here.',
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
                        {route.lastRunDate
                          ? formatDayLabel(route.lastRunDate)
                          : '—'}
                      </Text>
                    </View>
                  </View>
                  {runs.map((run) => (
                    <Pressable
                      key={run.entryId}
                      className="flex-row items-center justify-between pt-3 mt-3 border-t border-border-subtle"
                      onPress={() => openRun(run.entryId)}
                      style={({ pressed }) =>
                        pressed ? { opacity: 0.7 } : null
                      }
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
            <View
              className="bg-surface rounded-xl p-4 mt-4"
              testID="route-segments"
            >
              <Text className="text-text-primary text-sm font-semibold">
                {t('segments.onRoute', { defaultValue: 'Segments' })}
              </Text>
              {routeSegments.length === 0 ? (
                <Text className="text-text-secondary text-sm mt-1">
                  {t('segments.onRouteEmpty', {
                    defaultValue:
                      'Pick a stretch of this route to time yourself on it every time you run it.',
                  })}
                </Text>
              ) : (
                routeSegments.map((segment) => (
                  <Pressable
                    key={segment.id}
                    className="flex-row items-center justify-between pt-3 mt-3 border-t border-border-subtle"
                    onPress={() =>
                      navigation.navigate('SegmentDetail', { id: segment.id })
                    }
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                    accessibilityRole="button"
                    testID={`route-segment-${segment.id}`}
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-text-primary text-sm font-semibold">
                        {segmentTitle(t, segment, unit)}
                      </Text>
                      <Text className="text-text-secondary text-xs mt-0.5">
                        {segment.bestSeconds !== null
                          ? `${t('segments.bestTime', {
                              time: formatSegmentTime(segment.bestSeconds),
                              defaultValue: 'Best {{time}}',
                            })} · ${t('segments.efforts', {
                              count: segment.effortCount,
                              defaultValue: '{{count}} efforts',
                              defaultValue_one: '{{count}} effort',
                              defaultValue_other: '{{count}} efforts',
                            })}`
                          : t('segments.noEfforts', {
                              defaultValue: 'No efforts yet',
                            })}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={20} color="#999" />
                  </Pressable>
                ))
              )}
              <Button
                variant="link"
                testID="route-create-segment"
                onPress={() =>
                  navigation.navigate('SegmentCreate', { routeId: id })
                }
              >
                {t('segments.createFromRoute', {
                  defaultValue: 'Create segment',
                })}
              </Button>
            </View>
            {routeStops.available ? (
              <RouteStopsSection
                stops={routeStops.stops}
                isLoading={routeStops.isLoading}
                unit={unit}
              />
            ) : null}
            <RouteCueList cues={route.cues} unit={unit} />
            <View className="mt-4 gap-2">
              <Button onPress={start} disabled={busy}>
                {t('routes.start', { defaultValue: 'Start' })}
              </Button>
              {watchPaired ? (
                <View className="bg-surface rounded-xl p-4 gap-2">
                  <Text className="text-text-primary text-sm font-semibold">
                    {t('routes.watch.title', {
                      defaultValue: 'Run it without your phone',
                    })}
                  </Text>
                  {watchStatusText[watchStatus] ? (
                    <Text
                      className="text-text-secondary text-sm"
                      testID="route-watch-status"
                    >
                      {watchStatusText[watchStatus]}
                    </Text>
                  ) : (
                    <Text className="text-text-secondary text-sm">
                      {t('routes.watch.hint', {
                        defaultValue:
                          'Keep a copy on your watch, then start it from Cardio on the watch with the phone left behind.',
                      })}
                    </Text>
                  )}
                  {(watchStatus === 'onWatch' || watchStatus === 'pending') &&
                  offlineMapLines !== undefined ? (
                    <Text
                      className="text-text-secondary text-sm"
                      testID="route-watch-offline-map"
                    >
                      {offlineMapLines > 0
                        ? t('routes.watch.offlineMapReady', {
                            count: offlineMapLines,
                            defaultValue:
                              'Offline map ready: {{count}} nearby paths under the route',
                            defaultValue_one:
                              'Offline map ready: {{count}} nearby path under the route',
                            defaultValue_other:
                              'Offline map ready: {{count}} nearby paths under the route',
                          })
                        : t('routes.watch.offlineMapNone', {
                            defaultValue:
                              'No offline map: none of your other routes pass nearby, so only the route is drawn without a connection.',
                          })}
                    </Text>
                  ) : null}
                  {watchStatus !== 'onWatch' ? (
                    <Button
                      variant="secondary"
                      loading={watchBusy}
                      onPress={sendToWatch}
                    >
                      {watchStatus === 'none'
                        ? t('routes.watch.send', {
                            defaultValue: 'Send to watch',
                          })
                        : t('routes.watch.sendAgain', {
                            defaultValue: 'Send again',
                          })}
                    </Button>
                  ) : null}
                  {watchStatus === 'onWatch' ||
                  watchStatus === 'outdated' ||
                  watchStatus === 'pending' ? (
                    <Button
                      variant="secondary"
                      loading={watchBusy}
                      onPress={removeFromWatch}
                    >
                      {t('routes.watch.remove', {
                        defaultValue: 'Remove from watch',
                      })}
                    </Button>
                  ) : null}
                </View>
              ) : null}
              {name === null ? (
                <Button variant="secondary" onPress={() => setName(route.name)}>
                  {t('routes.rename', { defaultValue: 'Rename' })}
                </Button>
              ) : (
                <Button loading={busy} onPress={saveName}>
                  {t('common.save', { defaultValue: 'Save' })}
                </Button>
              )}
              <Button variant="secondary" onPress={share}>
                {t('routes.shareGpx', { defaultValue: 'Share as GPX' })}
              </Button>
              <Button variant="destructive" onPress={confirmDelete}>
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
};

export default RouteDetailScreen;
