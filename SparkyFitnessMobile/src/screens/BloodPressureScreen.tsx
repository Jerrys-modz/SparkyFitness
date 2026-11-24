import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  classifyBloodPressure,
  homeBloodPressureAverage,
  summarizeBloodPressure,
  type BloodPressureAverage,
} from '@workspace/shared';
import Button from '../components/ui/Button';
import BloodPressureChart from '../components/bloodPressure/BloodPressureChart';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useBloodPressureRange,
  useDeleteBloodPressure,
  type BloodPressureReading,
} from '../hooks/useBloodPressure';
import { addDays, formatDateLabel, getTodayDate } from '../utils/dateUtils';
import {
  bloodPressureArmLabel,
  bloodPressureCategoryLabel,
  bloodPressurePositionLabel,
  bloodPressureCategoryTextClass,
} from '../utils/bloodPressureCopy';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'BloodPressure'>;

const RANGE_DAYS = [7, 30, 90] as const;

const BloodPressureScreen: React.FC<Props> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const [days, setDays] = useState<(typeof RANGE_DAYS)[number]>(30);
  const today = getTodayDate();
  const { readings, isLoading, isError, refetch } = useBloodPressureRange(
    addDays(today, -(days - 1)),
    today
  );
  const deleteReading = useDeleteBloodPressure();
  useRefetchOnFocus(() => void refetch(), true);

  const summary = useMemo(() => summarizeBloodPressure(readings), [readings]);
  const home = useMemo(() => homeBloodPressureAverage(readings), [readings]);
  const latest = readings.length ? readings[readings.length - 1] : null;

  const header = useScreenHeader({
    title: t('screens.bloodPressure', { defaultValue: 'Blood pressure' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'icon',
        ionicon: 'add-outline',
        sfSymbol: 'plus',
        role: 'primary',
        accessibilityLabel: t('bloodPressure.add', {
          defaultValue: 'Add reading',
        }),
        onPress: () => navigation.navigate('BloodPressureAdd', {}),
      },
    ],
  });

  const confirmDelete = (reading: BloodPressureReading) => {
    Alert.alert(
      t('bloodPressure.deleteTitle', { defaultValue: 'Delete this reading?' }),
      t('bloodPressure.deleteMessage', {
        defaultValue:
          'A reading that came from a device can come back on the next sync.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            deleteReading.mutate(reading.id, {
              onError: () =>
                Toast.show({
                  type: 'error',
                  text1: t('bloodPressure.deleteFailed', {
                    defaultValue: 'Could not delete the reading',
                  }),
                }),
            }),
        },
      ]
    );
  };

  const averageTile = (label: string, average: BloodPressureAverage | null) => (
    <View className="bg-surface rounded-xl p-3 flex-1 min-w-[45%]">
      <Text className="text-xs text-text-muted">{label}</Text>
      <Text className="text-lg font-bold text-text-primary mt-0.5">
        {average ? `${average.systolic}/${average.diastolic}` : '-'}
      </Text>
      {average && (
        <Text className="text-xs text-text-muted">
          {t('bloodPressure.readingCount', {
            defaultValue_one: '{{count}} reading',
            defaultValue_other: '{{count}} readings',
            defaultValue: '{{count}} readings',
            count: average.count,
          })}
        </Text>
      )}
    </View>
  );

  const armLabel = (value: string) => bloodPressureArmLabel(t, value);
  const positionLabel = (value: string) => bloodPressurePositionLabel(t, value);

  return (
    <View className="flex-1 bg-background">
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
              {t('bloodPressure.loadFailed', {
                defaultValue: 'Could not load your blood pressure readings.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <View className="gap-4">
            <View className="flex-row gap-2">
              {RANGE_DAYS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setDays(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: days === option }}
                  className={`px-3 py-1.5 rounded-full border ${
                    days === option
                      ? 'bg-accent-primary border-accent-primary'
                      : 'border-border-subtle'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      days === option
                        ? 'text-white font-semibold'
                        : 'text-text-secondary'
                    }`}
                  >
                    {t('bloodPressure.lastDays', {
                      defaultValue_one: '{{count}} day',
                      defaultValue_other: '{{count}} days',
                      defaultValue: '{{count}} days',
                      count: option,
                    })}
                  </Text>
                </Pressable>
              ))}
            </View>

            {readings.length === 0 ? (
              <View className="items-center py-8 gap-4">
                <Text className="text-text-secondary text-base text-center">
                  {t('bloodPressure.empty', {
                    defaultValue:
                      'No readings in this period yet. Add one to start following your blood pressure.',
                  })}
                </Text>
                <Button
                  variant="primary"
                  onPress={() => navigation.navigate('BloodPressureAdd', {})}
                >
                  {t('bloodPressure.add', { defaultValue: 'Add reading' })}
                </Button>
              </View>
            ) : (
              <>
                {latest && (
                  <View className="bg-surface rounded-xl p-4">
                    <Text className="text-xs text-text-muted">
                      {t('bloodPressure.latest', { defaultValue: 'Latest' })} ·{' '}
                      {formatDateLabel(latest.date, t, dateLocale)}
                    </Text>
                    <View className="flex-row items-baseline gap-2 mt-1">
                      <Text
                        className={`text-3xl font-bold ${bloodPressureCategoryTextClass(
                          classifyBloodPressure(latest)
                        )}`}
                      >
                        {latest.systolic}/{latest.diastolic}
                      </Text>
                      <Text className="text-sm text-text-muted">
                        {t('bloodPressure.unit', { defaultValue: 'mmHg' })}
                      </Text>
                    </View>
                    <Text className="text-sm text-text-secondary mt-0.5">
                      {bloodPressureCategoryLabel(
                        t,
                        classifyBloodPressure(latest)
                      )}
                    </Text>
                  </View>
                )}

                <View className="flex-row flex-wrap gap-2">
                  {averageTile(
                    t('bloodPressure.average', { defaultValue: 'Average' }),
                    summary.overall
                  )}
                  {averageTile(
                    t('bloodPressure.homeAverage', {
                      defaultValue: 'Home average',
                    }),
                    home ? home.average : null
                  )}
                  {averageTile(
                    t('bloodPressure.morning', {
                      defaultValue: 'Morning average',
                    }),
                    summary.morning
                  )}
                  {averageTile(
                    t('bloodPressure.evening', {
                      defaultValue: 'Evening average',
                    }),
                    summary.evening
                  )}
                </View>
                <Text className="text-xs text-text-muted">
                  {home
                    ? home.atOrAboveHomeThreshold
                      ? t('bloodPressure.homeAtOrAbove', {
                          defaultValue_one:
                            'Home average over {{count}} day (first day left out) is at or above 135/85.',
                          defaultValue_other:
                            'Home average over {{count}} days (first day left out) is at or above 135/85.',
                          defaultValue:
                            'Home average over {{count}} days (first day left out) is at or above 135/85.',
                          count: home.daysUsed,
                        })
                      : t('bloodPressure.homeBelow', {
                          defaultValue_one:
                            'Home average over {{count}} day (first day left out) is below 135/85.',
                          defaultValue_other:
                            'Home average over {{count}} days (first day left out) is below 135/85.',
                          defaultValue:
                            'Home average over {{count}} days (first day left out) is below 135/85.',
                          count: home.daysUsed,
                        })
                    : t('bloodPressure.homeNeedsDays', {
                        defaultValue:
                          'The home average needs readings on at least 5 different days.',
                      })}
                </Text>

                <View className="bg-surface rounded-xl p-3">
                  <BloodPressureChart readings={readings} />
                </View>

                <View className="bg-surface rounded-xl overflow-hidden">
                  {[...readings].reverse().map((reading, index) => {
                    const category = classifyBloodPressure(reading);
                    const details = [
                      formatDateLabel(reading.date, t, dateLocale),
                      reading.pulse !== null
                        ? t('bloodPressure.pulseValue', {
                            defaultValue: '{{value}} bpm',
                            value: reading.pulse,
                          })
                        : null,
                      reading.arm ? armLabel(reading.arm) : null,
                      reading.bodyPosition
                        ? positionLabel(reading.bodyPosition)
                        : null,
                      reading.note,
                    ].filter(Boolean);
                    return (
                      <Pressable
                        key={reading.id}
                        onPress={
                          reading.manual
                            ? () =>
                                navigation.navigate('BloodPressureAdd', {
                                  reading: {
                                    id: reading.id,
                                    at: reading.at,
                                    systolic: reading.systolic,
                                    diastolic: reading.diastolic,
                                    pulse: reading.pulse,
                                    arm: reading.arm,
                                    bodyPosition: reading.bodyPosition,
                                    note: reading.note,
                                  },
                                })
                            : undefined
                        }
                        onLongPress={() => confirmDelete(reading)}
                        className={`px-4 py-3 ${
                          index > 0 ? 'border-t border-border-subtle' : ''
                        }`}
                        style={({ pressed }) =>
                          pressed ? { opacity: 0.7 } : null
                        }
                        accessibilityRole="button"
                      >
                        <Text
                          className={`text-base font-bold ${bloodPressureCategoryTextClass(
                            category
                          )}`}
                        >
                          {reading.systolic}/{reading.diastolic}{' '}
                          <Text className="text-sm font-normal text-text-secondary">
                            {bloodPressureCategoryLabel(t, category)}
                          </Text>
                        </Text>
                        <Text className="text-xs text-text-muted mt-0.5">
                          {details.join(' · ')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="text-xs text-text-muted">
                  {t('bloodPressure.hint', {
                    defaultValue:
                      'Tap a reading you logged to edit it. Press and hold any reading to delete it.',
                  })}
                </Text>
                <Text className="text-xs text-text-muted">
                  {t('bloodPressure.disclaimer', {
                    defaultValue:
                      'For your information only, not a diagnosis. Talk to a clinician about your readings.',
                  })}
                </Text>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default BloodPressureScreen;
