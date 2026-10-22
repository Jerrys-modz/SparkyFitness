import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  sliceRouteByDistance,
  routeDistanceMeters,
  type RoutePoint,
} from '@workspace/shared';
import RouteTileMap from '../components/exerciseStats/RouteTileMap';
import SegmentedControl from '../components/SegmentedControl';
import SegmentRangeSelector from '../components/segments/SegmentRangeSelector';
import Button from '../components/ui/Button';
import { cardioSessionDetailQueryKey } from '../hooks/queryKeys';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import { fetchWorkoutGpsPoints } from '../services/api/exerciseStatsApi';
import { useRoute } from '../services/routeService';
import { saveSegment } from '../services/segmentService';
import {
  canMakeSegment,
  defaultSegmentRange,
  segmentRangeLength,
  type SegmentRange,
} from '../utils/segmentRange';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'SegmentCreate'>;
type Activity = 'run' | 'walk' | 'ride' | 'hike';

/**
 * Makes a segment from a stretch of a saved route or of a recorded
 * activity's track: drag the two handles along the line, optionally name it,
 * and save. The server then looks through past activities for passes over it.
 */
const SegmentCreateScreen: React.FC<Props> = ({ navigation, route: nav }) => {
  const { routeId, exerciseEntryId, activity: activityParam } = nav.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';

  const routeQuery = useRoute(routeId ?? '');
  const trackQuery = useQuery({
    queryKey: cardioSessionDetailQueryKey('gps', exerciseEntryId ?? ''),
    queryFn: () => fetchWorkoutGpsPoints(exerciseEntryId ?? ''),
    enabled: !routeId && !!exerciseEntryId,
  });

  const line: RoutePoint[] = useMemo(() => {
    if (routeId) return routeQuery.route?.points ?? [];
    return (trackQuery.data?.points ?? []).map((p) => ({
      lat: p.lat,
      lon: p.lon,
    }));
  }, [routeId, routeQuery.route, trackQuery.data]);
  const loading = routeId ? routeQuery.isLoading : trackQuery.isLoading;
  const totalM = useMemo(() => routeDistanceMeters(line), [line]);

  const [range, setRange] = useState<SegmentRange | null>(null);
  const effectiveRange = useMemo(
    () =>
      range ?? (canMakeSegment(totalM) ? defaultSegmentRange(totalM) : null),
    [range, totalM]
  );
  const [name, setName] = useState('');
  const [activity, setActivity] = useState<Activity>(
    activityParam ?? routeQuery.route?.activity ?? 'run'
  );
  const [saving, setSaving] = useState(false);

  const stretch = useMemo(
    () =>
      effectiveRange
        ? sliceRouteByDistance(line, effectiveRange.startM, effectiveRange.endM)
        : null,
    [line, effectiveRange]
  );

  const header = useScreenHeader({
    title: t('screens.segmentCreate', { defaultValue: 'New segment' }),
    left: { kind: 'back' },
  });

  const save = () => {
    if (!effectiveRange || !stretch) return;
    setSaving(true);
    const trimmed = name.trim();
    const body =
      routeId !== undefined
        ? ({
            mode: 'route',
            routeId,
            startM: effectiveRange.startM,
            endM: effectiveRange.endM,
            activity,
            ...(trimmed ? { name: trimmed } : {}),
          } as const)
        : ({
            mode: 'points',
            points: stretch,
            activity,
            ...(exerciseEntryId
              ? { sourceExerciseEntryId: exerciseEntryId }
              : {}),
            ...(trimmed ? { name: trimmed } : {}),
          } as const);
    void saveSegment(body)
      .then((segment) => {
        Toast.show({
          type: 'success',
          text1: t('segments.create.saved', {
            defaultValue: 'Segment saved. Looking for your past efforts…',
          }),
        });
        navigation.replace('SegmentDetail', { id: segment.id });
      })
      .catch((error: unknown) => {
        addLog(`[Segments] Could not save a segment: ${error}`, 'WARNING');
        Toast.show({
          type: 'error',
          text1: t('segments.create.saveFailed', {
            defaultValue: 'Could not save the segment',
          }),
        });
      })
      .finally(() => setSaving(false));
  };

  const activities: { key: Activity; label: string }[] = [
    {
      key: 'run',
      label: t('recordActivity.activity.run', { defaultValue: 'Run' }),
    },
    {
      key: 'walk',
      label: t('recordActivity.activity.walk', { defaultValue: 'Walk' }),
    },
    {
      key: 'ride',
      label: t('recordActivity.activity.ride', { defaultValue: 'Ride' }),
    },
    { key: 'hike', label: t('routes.activity.hike', { defaultValue: 'Hike' }) },
  ];

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator />
        ) : !effectiveRange || !stretch ? (
          <Text
            className="text-text-secondary text-base text-center py-8"
            testID="segment-create-too-short"
          >
            {line.length < 2
              ? t('segments.create.noLine', {
                  defaultValue: 'There is no route to cut a segment from.',
                })
              : t('segments.create.tooShort', {
                  defaultValue:
                    'This route is too short for a segment (100 m at least).',
                })}
          </Text>
        ) : (
          <>
            <RouteTileMap
              points={stretch}
              guide={line}
              accessibilityLabel={t('segments.create.mapA11y', {
                defaultValue:
                  'Map of the route with the chosen segment drawn over it',
              })}
            />
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm font-semibold mb-1">
                {t('segments.create.pick', {
                  defaultValue: 'Drag the handles to choose the stretch',
                })}
              </Text>
              <SegmentRangeSelector
                totalM={totalM}
                range={effectiveRange}
                onChange={setRange}
                unit={unit}
              />
            </View>
            <View className="bg-surface rounded-xl p-4 mt-4 gap-3">
              <TextInput
                className="border-b border-border-subtle text-text-primary py-1"
                style={{ fontSize: 17 }}
                value={name}
                onChangeText={setName}
                maxLength={100}
                placeholder={t('segments.create.namePlaceholder', {
                  defaultValue: 'Name (optional)',
                })}
                accessibilityLabel={t('segments.create.nameLabel', {
                  defaultValue: 'Segment name',
                })}
                testID="segment-name-input"
              />
              <SegmentedControl
                segments={activities}
                activeKey={activity}
                onSelect={setActivity}
              />
              <Text className="text-text-secondary text-xs">
                {t('segments.create.activityHint', {
                  defaultValue:
                    'A ride segment is timed on rides only; the others on runs, walks and hikes.',
                })}
              </Text>
            </View>
            <View className="mt-4">
              <Button
                onPress={save}
                loading={saving}
                disabled={segmentRangeLength(effectiveRange) <= 0}
                testID="segment-save"
              >
                {t('segments.create.save', { defaultValue: 'Save segment' })}
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
};

export default SegmentCreateScreen;
