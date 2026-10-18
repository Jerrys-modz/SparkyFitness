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
import RouteTileMap from '../components/exerciseStats/RouteTileMap';
import SegmentEffortChart from '../components/segments/SegmentEffortChart';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import { openRunEntry } from '../services/openRunEntry';
import {
  findSegmentEfforts,
  removeSegment,
  renameSegment,
  useSegmentEfforts,
} from '../services/segmentService';
import { formatDayLabel } from '../utils/dayLabel';
import { formatRouteDistance } from '../utils/routeDisplay';
import {
  formatEffortGap,
  formatSegmentTime,
  segmentTitle,
} from '../utils/segmentDisplay';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'SegmentDetail'>;

/**
 * One segment: its map and length, the person's best time and count, their
 * efforts over time on a chart with each new record marked, and every effort
 * listed (a tap opens the run).
 */
const SegmentDetailScreen: React.FC<Props> = ({ navigation, route: nav }) => {
  const { id } = nav.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useSegmentEfforts(id);
  const segment = data?.segment;
  const efforts = data?.efforts ?? [];
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);

  const header = useScreenHeader({
    title: segment
      ? segmentTitle(t, segment, unit)
      : t('screens.segments', { defaultValue: 'Segments' }),
    left: { kind: 'back' },
  });

  const fail = (text: string, error: unknown) => {
    addLog(`[Segments] ${text}: ${error}`, 'WARNING');
    Toast.show({ type: 'error', text1: text });
  };

  const saveName = () => {
    if (name === null) return;
    setBusy(true);
    void renameSegment(id, name.trim() === '' ? null : name.trim())
      .then(() => setName(null))
      .catch((error: unknown) =>
        fail(
          t('segments.renameFailed', { defaultValue: 'Could not rename' }),
          error
        )
      )
      .finally(() => setBusy(false));
  };

  const search = () => {
    setSearching(true);
    void findSegmentEfforts(id)
      .then((found) =>
        Toast.show({
          type: 'success',
          text1: t('segments.searchDone', {
            count: found,
            defaultValue: 'Found {{count}} efforts',
            defaultValue_one: 'Found {{count}} effort',
            defaultValue_other: 'Found {{count}} efforts',
          }),
        })
      )
      .finally(() => setSearching(false));
  };

  const confirmDelete = () =>
    Alert.alert(
      t('segments.deleteTitle', { defaultValue: 'Delete this segment?' }),
      t('segments.deleteMessage', {
        defaultValue:
          'Your times on it are removed. The activities themselves are not affected.',
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
            void removeSegment(id)
              .then(() => navigation.goBack())
              .catch((error: unknown) =>
                fail(
                  t('segments.deleteFailed', {
                    defaultValue: 'Could not delete the segment',
                  }),
                  error
                )
              );
          },
        },
      ]
    );

  const openRun = (entryId: string) => {
    void openRunEntry(navigation, entryId, unit).catch((error: unknown) => {
      addLog(`[Segments] Could not open the run: ${error}`, 'WARNING');
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

  const best = segment?.bestSeconds ?? null;

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
        {isLoading ? (
          <ActivityIndicator />
        ) : isError || !segment ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('segments.loadOneFailed', {
                defaultValue: 'Could not load this segment.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <>
            {data && data.points.length > 1 ? (
              <RouteTileMap
                points={data.points}
                accessibilityLabel={t('segments.mapA11y', {
                  defaultValue:
                    'Map of this segment, from the green dot to the red ring',
                })}
              />
            ) : null}
            <View className="bg-surface rounded-xl p-4 mt-4">
              {name === null ? (
                <Text className="text-text-primary text-lg font-bold">
                  {segmentTitle(t, segment, unit)}
                </Text>
              ) : (
                <TextInput
                  className="border-b border-border-subtle text-text-primary py-1"
                  style={{ fontSize: 17 }}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  autoFocus
                  accessibilityLabel={t('segments.create.nameLabel', {
                    defaultValue: 'Segment name',
                  })}
                />
              )}
              <Text className="text-text-secondary text-sm mt-2">
                {formatRouteDistance(segment.lengthM, unit)}
              </Text>
              <View className="flex-row justify-between mt-3">
                <View>
                  <Text className="text-text-secondary text-xs">
                    {t('segments.best', { defaultValue: 'Best' })}
                  </Text>
                  <Text
                    className="text-text-primary text-base font-semibold"
                    testID="segment-best"
                  >
                    {best !== null ? formatSegmentTime(best) : '—'}
                  </Text>
                </View>
                <View>
                  <Text className="text-text-secondary text-xs">
                    {t('segments.count', { defaultValue: 'Efforts' })}
                  </Text>
                  <Text
                    className="text-text-primary text-base font-semibold"
                    testID="segment-count"
                  >
                    {segment.effortCount}
                  </Text>
                </View>
                <View>
                  <Text className="text-text-secondary text-xs">
                    {t('segments.last', { defaultValue: 'Last effort' })}
                  </Text>
                  <Text
                    className="text-text-primary text-base font-semibold"
                    testID="segment-last"
                  >
                    {segment.lastEffortDate
                      ? formatDayLabel(segment.lastEffortDate)
                      : '—'}
                  </Text>
                </View>
              </View>
            </View>

            {efforts.length >= 2 ? (
              <View className="bg-surface rounded-xl p-4 mt-4">
                <Text className="text-text-primary text-sm font-semibold mb-2">
                  {t('segments.overTime', {
                    defaultValue: 'Your times over time',
                  })}
                </Text>
                <SegmentEffortChart efforts={efforts} />
                <Text className="text-text-muted text-xs text-center mt-1">
                  {t('segments.chartCaption', {
                    defaultValue:
                      'Effort number, oldest first. Green dots are new records.',
                  })}
                </Text>
              </View>
            ) : null}

            <View
              className="bg-surface rounded-xl p-4 mt-4"
              testID="segment-efforts"
            >
              <Text className="text-text-primary text-sm font-semibold">
                {t('segments.effortsTitle', { defaultValue: 'Efforts' })}
              </Text>
              {efforts.length === 0 ? (
                <Text className="text-text-secondary text-sm mt-1">
                  {t('segments.noEffortsHint', {
                    defaultValue:
                      'No efforts found yet. Runs and walks with a recorded GPS track that pass this stretch in the same direction are timed automatically.',
                  })}
                </Text>
              ) : (
                efforts.map((effort) => (
                  <Pressable
                    key={effort.entryId}
                    className="flex-row items-center justify-between pt-3 mt-3 border-t border-border-subtle"
                    onPress={() => openRun(effort.entryId)}
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                    accessibilityRole="button"
                    testID={`segment-effort-${effort.entryId}`}
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-text-primary text-sm font-semibold">
                        {formatDayLabel(effort.date)}
                      </Text>
                      <Text className="text-text-secondary text-xs mt-0.5">
                        {[
                          formatSegmentTime(effort.elapsedSeconds),
                          best !== null && !effort.isBest
                            ? formatEffortGap(effort.elapsedSeconds, best)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {effort.isBest ? (
                      <Text
                        className="text-icon-success text-xs font-bold mr-2"
                        testID={`segment-best-badge-${effort.entryId}`}
                      >
                        {t('segments.bestBadge', { defaultValue: 'BEST' })}
                      </Text>
                    ) : effort.isPersonalRecord ? (
                      <Text
                        className="text-icon-success text-xs font-bold mr-2"
                        testID={`segment-pr-badge-${effort.entryId}`}
                      >
                        {t('segments.prBadge', { defaultValue: 'PR' })}
                      </Text>
                    ) : null}
                    <Icon name="chevron-forward" size={20} color="#999" />
                  </Pressable>
                ))
              )}
            </View>

            <View className="mt-4 gap-2">
              <Button variant="secondary" loading={searching} onPress={search}>
                {t('segments.findEfforts', {
                  defaultValue: 'Find past efforts',
                })}
              </Button>
              {name === null ? (
                <Button
                  variant="secondary"
                  onPress={() => setName(segment.name ?? '')}
                >
                  {t('routes.rename', { defaultValue: 'Rename' })}
                </Button>
              ) : (
                <Button loading={busy} onPress={saveName}>
                  {t('common.save', { defaultValue: 'Save' })}
                </Button>
              )}
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

export default SegmentDetailScreen;
