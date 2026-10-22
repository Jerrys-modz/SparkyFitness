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
import RouteMap from '../components/exerciseStats/RouteMap';
import RouteCueList from '../components/RouteCueList';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import {
  removeRoute,
  renameRoute,
  shareRouteGpx,
  useRoute,
} from '../services/routeService';
import { useSegments } from '../services/segmentService';
import { formatSegmentTime, segmentTitle } from '../utils/segmentDisplay';
import { formatRouteClimb, formatRouteDistance } from '../utils/routeDisplay';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RouteDetail'>;

/** One saved route: its map and numbers, rename, share as GPX, delete. */
const RouteDetailScreen: React.FC<Props> = ({ navigation, route: nav }) => {
  const { id } = nav.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { route, isLoading, isError, refetch } = useRoute(id);
  const { segments } = useSegments();
  const routeSegments = segments.filter(
    (segment) => segment.sourceRouteId === id
  );
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
            setDeleting(true);
            void removeRoute(id)
              .then(() => navigation.goBack())
              .catch((error: unknown) => {
                setDeleting(false);
                fail(
                  t('routes.deleteFailed', {
                    defaultValue: 'Could not delete the route',
                  }),
                  error
                );
              });
          },
        },
      ]
    );

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        keyboardShouldPersistTaps="handled"
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
            <RouteMap
              points={route.points}
              accessibilityLabel={t('routes.mapA11y', {
                defaultValue:
                  'Map of this route, from the green dot to the red ring',
              })}
            />
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
            <RouteCueList cues={route.cues} unit={unit} />
            <View className="mt-4 gap-2">
              {name === null ? (
                <Button variant="secondary" onPress={() => setName(route.name)}>
                  {t('routes.rename', { defaultValue: 'Rename' })}
                </Button>
              ) : (
                <>
                  <Button loading={busy} onPress={saveName}>
                    {t('common.save', { defaultValue: 'Save' })}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onPress={() => setName(null)}
                  >
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </>
              )}
              <Button variant="secondary" onPress={share}>
                {t('routes.shareGpx', { defaultValue: 'Share as GPX' })}
              </Button>
              <Button
                variant="destructive"
                loading={deleting}
                onPress={confirmDelete}
              >
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
