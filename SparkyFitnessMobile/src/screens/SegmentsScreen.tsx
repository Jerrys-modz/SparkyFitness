import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSegments } from '../services/segmentService';
import { formatDayLabel } from '../utils/dayLabel';
import { formatRouteDistance } from '../utils/routeDisplay';
import { formatSegmentTime, segmentTitle } from '../utils/segmentDisplay';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'Segments'>;

/**
 * The person's own segments: timed stretches of their routes and runs, with
 * their best time, how many times they have run each and the last time.
 * Personal only; nobody else's times are ever listed.
 */
const SegmentsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { segments, isLoading, isError, refetch } = useSegments();
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  useRefetchOnFocus(refetch, true);

  const header = useScreenHeader({
    title: t('screens.segments', { defaultValue: 'Segments' }),
    left: { kind: 'back' },
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
        {isLoading ? (
          <ActivityIndicator />
        ) : isError ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('segments.loadFailed', {
                defaultValue: 'Could not load your segments.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : segments.length === 0 ? (
          <Text
            className="text-text-secondary text-base text-center py-8"
            testID="segments-empty"
          >
            {t('segments.empty', {
              defaultValue:
                'No segments yet. Open a route or a recorded run, choose "Create segment" and pick a stretch to time yourself on.',
            })}
          </Text>
        ) : (
          <View className="bg-surface rounded-xl overflow-hidden">
            {segments.map((segment) => (
              <Pressable
                key={segment.id}
                className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
                onPress={() =>
                  navigation.navigate('SegmentDetail', { id: segment.id })
                }
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                accessibilityRole="button"
                testID={`segment-row-${segment.id}`}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold text-text-primary">
                    {segmentTitle(t, segment, unit)}
                  </Text>
                  <Text className="text-sm text-text-secondary mt-0.5">
                    {[
                      segment.name
                        ? formatRouteDistance(segment.lengthM, unit)
                        : null,
                      segment.effortCount > 0
                        ? t('segments.efforts', {
                            count: segment.effortCount,
                            defaultValue: '{{count}} efforts',
                            defaultValue_one: '{{count}} effort',
                            defaultValue_other: '{{count}} efforts',
                          })
                        : t('segments.noEfforts', {
                            defaultValue: 'No efforts yet',
                          }),
                      segment.bestSeconds !== null
                        ? t('segments.bestTime', {
                            time: formatSegmentTime(segment.bestSeconds),
                            defaultValue: 'Best {{time}}',
                          })
                        : null,
                      segment.lastEffortDate
                        ? t('segments.lastEffort', {
                            day: formatDayLabel(segment.lastEffortDate),
                            defaultValue: 'Last {{day}}',
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
          </View>
        )}
      </ScrollView>
    </>
  );
};

export default SegmentsScreen;
